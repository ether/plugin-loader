// This script takes the npm cache and outputs etherpad plugins

//var npm = require("npm");
const request = require('request');
const fs = require('fs');
const jsonDiff = require('json-diff');

const ignoredPlugins = {
  'ep_etherpad-lite': true,
  'ep_imageconvert': true,
}

var plugins = {};


function loadPluginInfo(name) {
//console.log('Load info for: ' + name);
  var options = {
    url: 'https://registry.npmjs.com/'+name,
    json: true
  }

  return new Promise(function (resolve, reject) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
    request(options, function(error, response, body) {
      if (error) {
        console.log(error, response);
        return reject();
      }
      var package = body;
      if (!package.name) {
        console.log('Package has no name: ', package);
      } else if (package.name.substring(0,3) == 'ep_') {
        plugins[package.name] = {
          name: package.name,
          description: '' + package.description,
          time: (new Date(package.time[package['dist-tags'].latest])).toISOString().split('T')[0],
          version: package['dist-tags'].latest,
          data: package,
        };
      }
      resolve();
    });
  });
}

var saveData = function(data) {
  let rawdata = fs.readFileSync('/var/www/etherpad-static/plugins.full.json');
  let persistedData = JSON.parse(rawdata);

  let persistedDataLength = Object.keys(persistedData).length;
  let newDataLength = Object.keys(data).length;

  let simplePlugins = JSON.parse(JSON.stringify(data));
  Object.keys(simplePlugins)
    .forEach(key => delete simplePlugins[key]['data']);

  if (persistedDataLength <= newDataLength) {
    let diff = jsonDiff.diffString(persistedData, data);
    if (diff != '') {
      console.log(diff);
      console.log('new length: ' + newDataLength);
      console.log('Saving new plugins.json file');
      fs.writeFileSync("/var/www/etherpad-static/plugins-" + getCurrentDate() + '.json', rawdata);
      fs.writeFileSync("/var/www/etherpad-static/plugins.full.json", JSON.stringify(data));


      fs.writeFileSync("/var/www/etherpad-static/plugins.new.json", JSON.stringify(simplePlugins));
      fs.renameSync("/var/www/etherpad-static/plugins.new.json", "/var/www/etherpad-static/plugins.json");
    }
    return;
  }

  console.log('new data have fewer entries: ' + newDataLength + '/' + persistedDataLength);

}

/*
function validJSON(string) {
  try {
    JSON.parse(string);
    return true;
  } catch(e) {
    return false;
  }
}
*/


var getCurrentDate = function() {
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

var randomProperty = function (obj) {
    var keys = Object.keys(obj);
    return keys[ keys.length * Math.random() << 0];
};


var loadDownloadStats = function(pluginList) {
  var options = {
    url: 'https://api.npmjs.org/downloads/point/last-month/'+pluginList.join(','),
    json: true
  }

  return new Promise(function (resolve, reject) {
    request(options, function(error, response, body) {
      if (error) {
        console.log(error, response);
        return reject();
      }

      for (let i=0; i < pluginList.length; i++) {
        plugins[pluginList[i]]['downloads'] = body[pluginList[i]]['downloads'];
      }

      resolve();
    });
  });

};

async function main() {
  let rawdata = fs.readFileSync('/var/www/etherpad-static/plugins.full.json');
  plugins = JSON.parse(rawdata);

  for (let i=0; i < 200; i++) {
    await loadPluginInfo(randomProperty(plugins));
  }

  for (let i=0; i < Object.keys(plugins).length; i+=100) {
    await loadDownloadStats(Object.keys(plugins).slice(i, i+100));
  }

  saveData(plugins);

}

main();
