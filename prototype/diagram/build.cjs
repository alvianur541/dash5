const fs=require('node:fs');
const path=require('node:path');
const {validate}=require('./core.cjs');
const directory=__dirname;
const fixture=JSON.parse(fs.readFileSync(process.argv[2]||path.join(directory,'generated-example.json'),'utf8'));
validate(fixture.diagram);
const safe=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const html=fs.readFileSync(path.join(directory,'view.template.html'),'utf8')
 .replace('/*CORE*/',()=>fs.readFileSync(path.join(directory,'core.cjs'),'utf8'))
 .replace('/*FIXTURE*/',()=>safe(fixture))
 .replace('/*INPUT*/',()=>safe(fs.readFileSync(process.argv[4]||path.join(directory,'example-input.txt'),'utf8')));
const output=process.argv[3]||path.join(directory,'dash5-diagram-test.html');
fs.writeFileSync(output,html);console.info('Offline artifact written:',output);
