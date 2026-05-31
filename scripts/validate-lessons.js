const fs = require('fs');
const path = require('path');
global.window = global;
eval(fs.readFileSync(path.join(__dirname, '../js/chess-engine.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../js/training.js'), 'utf8'));

const bad = [];
ZChess.Training.getLessons().forEach(l => {
  if (!l._expected || !l._expected.length) {
    bad.push(l.id + ': no expected moves');
    return;
  }
  l.solutionUci.forEach((uci, i) => {
    const e = l._expected[i];
    if (!e || !e.from) bad.push(l.id + ': ' + uci + ' unresolved');
  });
});

if (bad.length) {
  console.log('FAILED:');
  bad.forEach(b => console.log('  ' + b));
  process.exit(1);
}
console.log('All ' + ZChess.Training.getLessons().length + ' lessons OK');
