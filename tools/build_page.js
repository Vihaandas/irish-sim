// Builds sim/index.html (stand-alone, open it in Chrome) from src/page.html (the Artifact page body).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const body = fs.readFileSync(path.join(root, 'src', 'page.html'), 'utf8');
fs.writeFileSync(path.join(root, 'page.html'), body);
fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n' + body + '\n</body>\n</html>\n');
console.log('wrote index.html + page.html');
