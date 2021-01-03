const ChangesStream = require('concurrent-couch-follower');
const Normalize = require('normalize-registry-metadata');
const jsonDiff = require('json-diff');
const request = require('request');
const https = require('https');
const express = require('express')
const app = express()

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const db = 'https://replicate.npmjs.com/registry/_changes';
const saveInDb = async (seq, cb) => {
  try {
    const client = await pool.connect();
    const query = `UPDATE data SET value=($1) WHERE id = 'sequence'`;
    await client.query(query, [seq]);
    client.release();
  } catch (err) {
    console.error('saveInDb', err);
  }
  cb();
}


const PORT = process.env.PORT || 5001;

//const pluginsPath = '/var/www/etherpad-static/%s.json';
const pluginsPath = '%s.json';

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
  } else if (change.id.substr(0, 3) === 'ep_' && change.deleted === true) {
    console.log('Delete ' + change.id);

    persistPlugins(function (plugins) {
      delete plugins[change.id];
      return plugins;
    });
  }

  done();
}

let loadDownloadStats = function(pluginList) {
  let options = {
    url: 'https://api.npmjs.org/downloads/point/last-month/'+pluginList.join(','),
    json: true
  }

  return new Promise(function (resolve, reject) {
    request(options, async function(error, response, body) {
      if (error || body.error) {
        console.log(error, response);
        return reject();
      }

      await persistPlugins(function (plugins) {
        console.log('persistPlugins callback', plugins)
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

let persistPlugins = async (changeCb) => {
  // let plugins = JSON.parse(fs.readFileSync(util.format(pluginsPath, 'plugins.full')));
  let plugins = {};

  try {
    plugins = await getPluginData();
    console.log('persistPlugins', plugins)
  } catch (err) {
    console.error(err);
  }

  let updatedPlugins = changeCb(JSON.parse(JSON.stringify(plugins)));

  let diff = jsonDiff.diffString(plugins, updatedPlugins);

  let persistedDataLength = Object.keys(plugins).length;
  let newDataLength = Object.keys(updatedPlugins).length;

  if (diff !== '' && (persistedDataLength - 1) <= newDataLength) {
    let simplePlugins = JSON.parse(JSON.stringify(updatedPlugins));
    Object.keys(simplePlugins)
      .forEach(key => delete simplePlugins[key]['data']);

    // console.log(diff);
    //fs.writeFileSync(util.format(pluginsPath, 'plugins.full'), JSON.stringify(updatedPlugins));

    try {
      const client = await pool.connect();
      const query = `UPDATE data SET value=($1) WHERE id = 'plugins.full.json'`;
      await client.query(query, [plugins]);
      client.release();
    } catch (err) {
      console.error('saveInDb', err);
    }

    console.log('saved plugins');
  }
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

// let createFile = function(path) {
//   fs.writeFile(path, "{}", { flag: 'wx' }, function (err) {
//     if (err) throw err;
//   });
// }
//
// let createFiles = function() {
//   createFile(util.format(pluginsPath, 'plugins.full'));
// }
//
// createFiles();

let stream;

let loadSequenceFromDB = async () => {
  try {
    console.log('loadSequenceFromDB')
    const client = await pool.connect();
    const result = await client.query(`SELECT value FROM data WHERE id = 'sequence'`);
    console.log(result);
    client.release();
    return result.rows[0].value
  } catch (err) {
    console.error('loadSequenceFromDB error:', err);
    return null
  }
}

let startStream = async () => {
  let sequence = await loadSequenceFromDB()
  let configOptions = {
    db: db,
    include_docs: true,
    sequence: (seq, cb) => {
      saveInDb(seq, cb)
    },
    since: sequence,
    concurrency: 4
  }

  stream = ChangesStream(dataHandler, configOptions);

  stream.on('error', function(data) {
    console.error(data);
    startStream()
  });

}

startStream()

loadLatestId()

let getPluginData = async () => {
  const client = await pool.connect();
  const result = await client.query(`SELECT value FROM data WHERE id = 'plugins.full.json'`);
  client.release();
  return result.rows[0].value;
}

let loadDownloadStatsForAllPlugins = function() {
  console.log('Reload download stats');
  let rawdata = getPluginData()
  let plugins = JSON.parse(rawdata);

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

app.get('/plugins.full.json', async (req, res) => {
  try {
    res.json(await getPluginData())
  } catch (err) {
    console.error(err);
    res.send("Error " + err);
  }
})

app.listen(PORT, () => {
  console.log(`Example app listening at http://localhost:${PORT}`)
})
