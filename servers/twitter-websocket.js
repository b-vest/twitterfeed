// twitter-websocket.js elasticsearch to browser query engine
const WebSocket = require('ws');
const elastic = require('elasticsearch');
require('dotenv').config()
//set wss var here since it could be used for SSL or NO SSL
var wss;
//This script uses the .env setting SSL to decide if the scipt should load the SSL
//processing code or not. In a lab environment we can run all of this without SSL
//on the public web SSL is required. I wanted this to be compatible with either.
if(process.env.SSL === "NO"){
  wss = new WebSocket.Server({ port: process.env.WS_SOCKET_PORT || '8080' })
}else{
  //fs modules required to process SSL keys
  const fs = require('fs')
  const util = require('util');
  const readFile = util.promisify(fs.readFile);
  //fs modules
  //handles http and https for the websocket
  const express = require('express');
  const http = require('http');
  const serverPort = process.env.SERVER_PORT || '9889';
  const app = express();
  const server = app.listen(serverPort, () => console.log(`Server listening on ${serverPort}: `));
  const SocketServer = require('ws').Server;
  //https websocket
  //load SSL certificates and set to credentials variable
  var privateKey = fs.readFileSync('ssl-cert/privkey.pem', 'utf8');
  var certificate = fs.readFileSync('ssl-cert/fullchain.pem', 'utf8');
  var credentials = { key: privateKey, cert: certificate };
  //load https module
  var https = require('https');
  //create https object
  var httpsServer = https.createServer(credentials);
  //load websocket module
  var WebSocketServer = require('ws').Server;
  //start https server
  httpsServer.listen(8553);

//open web socket, route through https server 
  wss = new WebSocketServer({
    server: httpsServer
  });
}

//build elasticsearch client with values from process.env
var elasticClient = new elastic.Client({
  host: process.env.ELASTICSEARCH_USER+":"+process.env.ELASTICSEARCH_PASSWORD+"@"+process.env.ELASTICSEARCH_HOST,
  log: 'info',
    sniff: true,
    apiVersion: '7.x',
});

//create work object. I use this work object layout when working with async variables.
//this is a global variable that pass all process information around to the functions
var workObject = {
  queries:{
    //The only query used for this part of the project. Index is set from .env
    userHashtagAggregateQuery: {"index":process.env.ELASTICSEARCH_INDEX,"body":{"aggs":{"ScreenName":{"terms":{"field":"user.screen_name","order":{"_count":"desc"},"size":process.env.QUERY_USER_LIMIT},"aggs":{"Hashtags":{"terms":{"field":"entities.hashtags.text","order":{"_count":"desc"},"size":process.env.QUERY_TAG_LIMIT}}}}},"size":0,"fields":[{"field":"retweeted_status.timestamp_ms","format":"date_time"},{"field":"timestamp_ms","format":"date_time"}],"script_fields":{},"stored_fields":["*"],"runtime_mappings":{},"_source":{"excludes":[]},"query":{"bool":{"must":[],"filter":[{"range":{"timestamp_ms":{"format":"strict_date_optional_time","gte":"now-"+process.env.QUERY_SPAN,"lte":"now"}}}],"should":[],"must_not":[]}}}}
  },
  groupCounter: 1,
  runningQuery: "userHashtagAggregateQuery", // here we set the first query to run and track process progress. For future expansion.
  network:{
    nodes:[],
    links:[],
    barchart:[]
  }
};

//refresh the data in memory on load
refreshData(workObject);
//start web socket processing
//currently we do nothing here as every update will be sent to all clients
//by looping wss.clients.forEach
wss.on('connection', ws => {
  //refreshData(workObject);
  ws.on('message', message => {
  })
});

setInterval(refreshData, process.env.DATA_UPDATE_INTERVAL, workObject);

//We will use this async function to actually run the function chain
//so we can call it from an Interval timer.
async function refreshData(workObject){
  try{
    runElasticsearchQuery(workObject).
    then((workObject => prepareData(workObject).
    then((workObject => sendToClients(workObject)))));
  }catch(error){
    console.log(error);
  }
}


async function runElasticsearchQuery(workObject){
  try{
    // send query to elasticsearch, wait for response. 
    // elasticsearch query errors are handled by catch(error)
    const response = await elasticClient.search(workObject.queries[workObject.runningQuery]);
    workObject.response = response.aggregations
    return workObject;
  }catch(error){
    console.log(error);
  }
}

async function prepareData(workObject){
  try{
    //Shorten bucket variable inside this function
    var data = workObject.response;
    //Create name object so the same names do not end up in nodes twice
    //We will simply set the node name with a value of 1 to mark it as used.
    //In this project only the hastag nodes could be duplicated so it will
    //be used in that loop
    var usedNodes = new Object();
    //Clear the workObject.network key
    workObject.network = {
      nodes: [],
      links: [],
      barchart: []
    }
    if(workObject.runningQuery === "userHashtagAggregateQuery"){
      //Loop through the buckets
      for (const object of data.ScreenName.buckets){
        //We only want to send data that has hashtags.
        //Since the response is in an array we can check
        //the length of the array to see if we should
        //process this bucket
        if(object.Hashtags.buckets.length > 0){
          //this is added to the barchart array that will be sent to the client
          // for barcharts you only need key and a value.
          var barChart = {User: object.key, Value: object.doc_count};
          //push to barchart array
          workObject.network.barchart.push(barChart);
          //this is added to the network.nodes array for use by the network graph
          var nodeData = {
            id: object.key,
            group: workObject.groupCounter, //Each screen_name will be its own group
          };

          //push networ.nodes array
          workObject.network.nodes.push(nodeData);
          //Loop through the hash tag bucket
          for (const tagObject of object.Hashtags.buckets){
            //the hashtags also need a node
            //these we have to check for duplicates
            if(!usedNodes[tagObject.key]){
              //this is used by the d3 network graph
              var nodeData = {
                id: "#"+tagObject.key, 
                group: workObject.groupCounter,
              }//push to the networ.nodes array
              workObject.network.nodes.push(nodeData);
              //Add entry to duplicate checker
              usedNodes[tagObject.key] = 1;
            }else{
              ++usedNodes[tagObject.key]
            }
            //this is needed by the d3 network graph
            var linkData = {
              source: object.key, //the source will be the user set above
              target: "#"+tagObject.key, //this is the destination hashtag
              value: Math.round(object.doc_count/9) //This is optional. It could just be 1, sets the width of the connecting line.
            };
            //push to network.links array
            workObject.network.links.push(linkData);
          }
          //Increment the group counter since we are done with it
          ++workObject.groupCounter
        }else{
        }
      }
    }
    return workObject;
  }catch(error){
    console.log(error);
  }
}

async function sendToClients(workObject){
  try{
    //We will actually send another object
    //so we can add a few things that
    //can change depending on the query.
    var sendObject = {};
    if(workObject.runningQuery === "userHashtagAggregateQuery"){
      sendObject.data = workObject.network;
      sendObject.function = "userHashtagAggregateQuery"
    }
    //loop through wss clients to send new JSON packet to all connected hosts.
    wss.clients.forEach(function(client) {
      client.send(JSON.stringify(sendObject));  
    });
    return workObject;
  }catch(error){
    console.log(error)
  }
}





