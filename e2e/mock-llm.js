// Minimal stand-ins for the Anthropic Messages API (SSE streaming) and the OpenAI
// Chat Completions API, so the end-to-end tests need no keys and cost nothing.
const http = require('http');

const port = Number(process.env.MOCK_LLM_PORT || 5196);

function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content;
    const t = (m.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    if (t) return t;
  }
  return '';
}

http.createServer((req, res) => {
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    const json = body ? JSON.parse(body) : {};
    const question = lastUserText(json.messages || []).split('\n').pop();
    // How many earlier user turns the model received (proves history is sent)
    const turns = (json.messages || []).filter(m => m.role === 'user').length;

    if (req.url.startsWith('/v1/messages')) {
      const text = `Claude reply #${turns} to: ${question}`;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      send('message_start', { type: 'message_start', message: { id: 'msg_e2e', type: 'message', role: 'assistant', model: json.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } });
      send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
      send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } });
      send('content_block_stop', { type: 'content_block_stop', index: 0 });
      send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } });
      send('message_stop', { type: 'message_stop' });
      return res.end();
    }

    if (req.url.startsWith('/v1/chat/completions')) {
      const content = `OpenAI reply #${turns} to: ${question}`;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({
        id: 'c', object: 'chat.completion', created: 0, model: json.model,
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      }));
    }

    if (req.url === '/health') { res.writeHead(200); return res.end('ok'); }
    res.writeHead(404); res.end();
  });
}).listen(port, '127.0.0.1', () => console.log(`mock LLM on ${port}`));
