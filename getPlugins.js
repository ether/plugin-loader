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


async function loadList() {
  let npmPackageList = fs.readFileSync(__dirname + '/_all_docs');
  let packageList = JSON.parse(npmPackageList);

  let packages = packageList.rows;

  let package_names = [];
  for (let key in packages) {
    let name = packages[key].id;
    if (name.substring(0,3) == 'ep_') {
      package_names.push(name);
    }
  }

  return package_names;
}

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



async function main() {
  let rawdata = fs.readFileSync('/var/www/etherpad-static/plugins.full.json');
  plugins = JSON.parse(rawdata);

  let newPackageList = await loadList().catch(function(error) { console.log(error); });

  for (let i=0; i < newPackageList.length; i++) {
    if (!(newPackageList[i] in plugins) && !(newPackageList[i] in ignoredPlugins)) {
      console.log('new package: ' + newPackageList[i]);
      await loadPluginInfo(newPackageList[i]);
    }
  }

  for (let i=0; i < 50; i++) {
    await loadPluginInfo(randomProperty(plugins));
  }

  saveData(plugins);

}

main();
