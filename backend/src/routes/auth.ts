import express from 'express';

const router = express.Router();

// 1. Get active auth state
router.get('/status', (req, res) => {
  const passwordConf = process.env.PASSWORD || 'admin';
  const passwordRequired = !!passwordConf;
  res.status(200).json({
    passwordRequired: passwordRequired,
    loggedIn: !passwordRequired || !!req.session.loggedIn
  });
});

// 2. Login action
router.post('/login', (req, res) => {
  const passwordConf = process.env.PASSWORD || 'admin';
  const passwordRequired = !!passwordConf;
  if (passwordRequired) {
    if (req.body.password === passwordConf) {
      req.session.loggedIn = true;
      res.status(200).json({ msg: 'Logged in successfully' });
    } else {
      res.status(400).json({ msg: 'Incorrect password' });
    }
  } else {
    res.status(200).json({ msg: 'No password is set' });
  }
});

// 3. Logout action
router.post('/logout', (req, res) => {
  req.session.loggedIn = null;
  res.status(200).json({ msg: 'Logged out successfully' });
});

export default router;
