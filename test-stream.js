import { createTerminalMarkdownStream } from 'markstream-cli';
const s = createTerminalMarkdownStream();
s.start();
s.push('Hello **world**!\n```js\nconst x = 1;\n```');
s.stop();
