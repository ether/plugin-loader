const ChangesStream = require('concurrent-couch-follower');
const Normalize = require('normalize-registry-metadata');
const fs = require('fs');

const db = 'https://replicate.npmjs.com/registry/_changes';
var configOptions = {
  db: db,
  include_docs: true,
  sequence: '.sequence',
  now: false,
  concurrency: 200
}

// var changes = new ChangesStream({
//   db: db,
//   include_docs: true
// });

let rawdata = JSON.parse(fs.readFileSync('packages-debug.json'));

let start = new Date();

var dataHandler = function(data, done) {
  let change = data;
  if (change.seq % 1000 === 0) {
    let duration = (new Date() - start) / 1000;
    console.log(change.seq + ': Took ' + Math.round(duration) + ' s');
    start = new Date();
  }

  if (change.doc && change.doc.name) {
    let name = change.doc.name;
    if (name.substr(0, 3) === 'ep_') {
      let data = Normalize(change.doc);

      rawdata.packages[name] = {
        data: data,
        name: name,
        version: data['dist-tags'].latest,
      };
      rawdata.seq = change.seq;

      fs.writeFileSync("packages-debug.json", JSON.stringify(rawdata));
      console.log(change.doc.name);

      let plugins = JSON.parse(fs.readFileSync('/var/www/etherpad-static/plugins.full.json'));
      if (!(name in plugins)) {
        console.log('new package: ' + name);
        plugins[name] = {
          name: name,
          description: '' + data.description,
          time: (new Date(data.time[data['dist-tags'].latest])).toISOString().split('T')[0],
          version: data['dist-tags'].latest,
          data: data,
        }

        fs.writeFileSync("/var/www/etherpad-static/plugins.full.json", JSON.stringify(plugins));
      }

      //console.log(Normalize(change.doc));
    }
  }

  done();
}

var stream = ChangesStream(dataHandler, configOptions);

stream.on('error', function(data) {
  console.log(data);
});

/*
changes.on('data', function (change) {
  if (change.seq % 500 === 1) {
    console.log(change.seq);
  }
  if (change.doc.name) {
    if (change.doc.name.substr(0, 3) === 'ep_') {
      let data = Normalize(change.doc);
      rawdata.packages.push({
        raw: change,
        data: data,
        name: change.doc.name,
        version: data['dist-tags'].latest,
      });
      rawdata.seq = change.seq;

      fs.writeFileSync("packages.json", JSON.stringify(rawdata));
      console.log(change.doc.name);
      //console.log(Normalize(change.doc));
    }
  }
});
*/

