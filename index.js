const ChangesStream = require('concurrent-couch-follower');
const Normalize = require('normalize-registry-metadata');
const jsonDiff = require('json-diff');
const request = require('request');
const fs = require('fs');
const https = require('https');
const util = require('util');

const db = 'https://replicate.npmjs.com/registry/_changes';
const configOptions = {
  db: db,
  include_docs: true,
  sequence: '.sequence',
  now: false,
  concurrency: 4
}

const pluginsPath = '/var/www/etherpad-static/%s.json';
//const pluginsPath = '%s.json';

let start = new Date();

let dataHandler = function(change, done) {
  if (change.seq % 1000 === 0) {
    let duration = (new Date() - start) / 1000;
    console.log(change.seq + ': Took ' + Math.round(duration) + ' s');
    start = new Date();
  }

  if (change.doc && change.doc.name) {
    let name = change.doc.name;
    if (name.substr(0, 3) === 'ep_') {
      let data = Normalize(change.doc);

      console.log(change.doc.name);

      persistPlugins(function (plugins) {
        if (data.versions[data['dist-tags'].latest].deprecated) {
          delete plugins[name];
          return plugins;
        }

        if (!(name in plugins)) {
          plugins[name] = {
            name: name,
          }
        }

        plugins[name]['description'] = '' + data.description;
        plugins[name]['time'] = '' + (new Date(data.time[data['dist-tags'].latest])).toISOString().split('T')[0];
        plugins[name]['version'] = '' + data['dist-tags'].latest;
        plugins[name]['data'] = data;
        return plugins;
      });
    }
  }

  done();
}

let loadDownloadStats = function(pluginList) {
  let options = {
    url: 'https://api.npmjs.org/downloads/point/last-month/'+pluginList.join(','),
    json: true
  }

  return new Promise(function (resolve, reject) {
    request(options, function(error, response, body) {
      if (error || body.error) {
        console.log(error, response);
        return reject();
      }

      persistPlugins(function (plugins) {
        if (pluginList.length === 1) {
          if (!(pluginList[0] in plugins)) {
            plugins[pluginList[0]] = {};
          }
          plugins[pluginList[0]]['downloads'] = body['downloads'];
          return plugins;
        } else {
          for (let i=0; i < pluginList.length; i++) {
            if (body.hasOwnProperty(pluginList[i]) && body[pluginList[i]] && body[pluginList[i]].hasOwnProperty('downloads')) {
              plugins[pluginList[i]]['downloads'] = body[pluginList[i]]['downloads'];
            } else {
              console.log('No download stats for: ' + pluginList[i]);
            }
          }
        }
        return plugins;
      });

      resolve();
    });
  });

};

let persistPlugins = function(changeCb) {
  let plugins = JSON.parse(fs.readFileSync(util.format(pluginsPath, 'plugins.full')));

  let updatedPlugins = changeCb(JSON.parse(JSON.stringify(plugins)));

  let diff = jsonDiff.diffString(plugins, updatedPlugins);

  let persistedDataLength = Object.keys(plugins).length;
  let newDataLength = Object.keys(updatedPlugins).length;

  if (diff !== '' && (persistedDataLength - 1) <= newDataLength) {
    let simplePlugins = JSON.parse(JSON.stringify(updatedPlugins));
    Object.keys(simplePlugins)
      .forEach(key => delete simplePlugins[key]['data']);

    console.log(diff);
    fs.writeFileSync(util.format(pluginsPath, 'plugins-' + getCurrentDate()), JSON.stringify(plugins));
    fs.writeFileSync(util.format(pluginsPath, 'plugins.full'), JSON.stringify(updatedPlugins));


    fs.writeFileSync(util.format(pluginsPath, 'plugins.new'), JSON.stringify(simplePlugins));
    fs.renameSync(util.format(pluginsPath, 'plugins.new'), util.format(pluginsPath, 'plugins'));
    console.log('saved plugins');
  }
}

let getCurrentDate = function() {
  var d = new Date(),
    month = '' + (d.getMonth() + 1),
    day = '' + d.getDate(),
    year = d.getFullYear();

  if (month.length < 2)
    month = '0' + month;
  if (day.length < 2)
    day = '0' + day;

  return [year, month, day].join('-');
}

let loadLatestId = function() {
  let url = 'https://replicate.npmjs.com/';

  https.get(url, function(res) {
    let body = '';

    res.on('data', function(chunk){
      body += chunk;
    });

    res.on('end', function(){
      let statusJson = JSON.parse(body);
      console.log('Latest version: ' + statusJson.update_seq);
    });
  });
};

let stream = ChangesStream(dataHandler, configOptions);

loadLatestId();

stream.on('error', function(data) {
  console.error(data);
  stream = ChangesStream(dataHandler, configOptions);
});

let loadDownloadStatsForAllPlugins = function() {
  console.log('Reload download stats');
  let rawdata = fs.readFileSync(util.format(pluginsPath, 'plugins.full'));
  plugins = JSON.parse(rawdata);

  let promises = [];
  for (let i=0; i < Object.keys(plugins).length; i+=100) {
    promises.push(loadDownloadStats(Object.keys(plugins).slice(i, i+100)));
  }

  Promise.all(promises).then((values) => {
    console.log('Finished reloading download stats!');
  }).catch((reason) => {
    console.error(reason);
  });
};

// Update download stats every two hours
setInterval(loadDownloadStatsForAllPlugins, 1000 * 60 * 60 * 2);

