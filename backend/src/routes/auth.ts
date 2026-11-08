import express from 'express';
import { getSecurityConfig, safeEqual, RateLimiter } from '../utils/security';

const router = express.Router();

// Max 10 failed login attempts per IP per 15 minutes
const loginLimiter = new RateLimiter(10, 15 * 60 * 1000);

// 1. Get active auth state
router.get('/status', (req, res) => {
  res.status(200).json({
    passwordRequired: true,
    loggedIn: !!req.session.loggedIn,
    // Lets the UI hide options the server will reject
    features: {
      localConnections: getSecurityConfig().allowLocalPaths
    }
  });
});

// 2. Login action
router.post('/login', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const waitMs = loginLimiter.hit(ip);
  if (waitMs > 0) {
    res.setHeader('Retry-After', Math.ceil(waitMs / 1000).toString());
    return res.status(429).json({ msg: `Too many login attempts. Try again in ${Math.ceil(waitMs / 60000)} minute(s).` });
  }

  const { password } = getSecurityConfig();
  const supplied = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!safeEqual(supplied, password)) {
    return res.status(400).json({ msg: 'Incorrect password' });
  }

  loginLimiter.reset(ip);
  // Regenerate the session id on login to prevent session fixation
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ msg: 'Failed to create session' });
    req.session.loggedIn = true;
    req.session.save(saveErr => {
      if (saveErr) return res.status(500).json({ msg: 'Failed to create session' });
      res.status(200).json({ msg: 'Logged in successfully' });
    });
  });
});

// 3. Logout action
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('baseflow.sid');
    res.status(200).json({ msg: 'Logged out successfully' });
  });
});

export default router;
