//twitter-stream.js Read twitter Stream and ingest it into Elasticsearch
//Load Modules
const Twitter = require('twitter');
const elastic = require('elasticsearch');
require('dotenv').config()

if(process.env.STREAM_DEBUG === 1){
  console.log("DEBUG ENABLED "+process.env.STREAM_DEBUG)
}
//Build Elasticsearch Client using dotenv variables
var elasticClient = new elastic.Client({
  host: process.env.ELASTICSEARCH_USER+":"+process.env.ELASTICSEARCH_PASSWORD+"@"+process.env.ELASTICSEARCH_HOST,
  log: 'info',
    sniff: true,
    apiVersion: '7.x',
});

//Build Twitter Client using dotenv Variables
var twitterClient = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_TOKEN_SECRET
});

//Array to hold what will be sent to Elasticsearch
var sendArray = [];
//Count the tweets to compare to ELASTICSEARCH_BATCH_SIZE
var tweetCounter = 0;

twitterClient.stream('statuses/filter',{lang: process.env.TWITTER_LANG, track: process.env.TWITTER_TRACK, follow: process.env.TWITTER_FOLLOW},  function(stream) {
  stream.on('data', function(tweet) {
    //Add Tweet to Array
    sendArray.push(tweet);
    if(tweetCounter >= process.env.ELASTICSEARCH_BATCH_SIZE){
      //Send Tweet Array
    	bulkIndexTweets(sendArray);
      //Tweets have been ingested, reset array and counter
    	sendArray = [];
    	tweetCounter = 0;
    }
   	++tweetCounter;
    //Set nowDate for checking checkLogFrequency() to exit the process if the stream stalls
    nowDate = Date.now();

  });
  //Handle twitter stream errors
 stream.on('error', function(error) {
    console.log(error);
  });
});

//set now Date for Stream health checking
var nowDate = Date.now();
//start interval time to check stream every 20 seconds
var myVar = setInterval(checkLogFrequency, 20000);


async function bulkIndexTweets(sendArray){
	try{
      if(process.env.STREAM_DEBUG){
        console.log("DEBUG: running bulkIndexTweets");
        console.log("SAMPLE:")
        console.log(sendArray[0]);
      }
      //create flatmap out of array, this adds the _index: field to every element of the array created above.
	  	const body = sendArray.flatMap(doc => [{ index: { _index: process.env.ELASTICSEARCH_INDEX } }, doc])
      //Send the body flatmap to Elasticsearch and wait for response, this is why this is an async function
	  	const { body: bulkResponse } = await elasticClient.bulk({ refresh: true, body })
      //if Rsponse then it mayh be an error. Check for that here.
  		if (bulkResponse) {
    		const erroredDocuments = []
    		bulkResponse.items.forEach((action, i) => {
      			const operation = Object.keys(action)[0]
      			if (action[operation].error) {
        			erroredDocuments.push({
          				status: action[operation].status,
          				error: action[operation].error,
          				operation: body[i * 2],
          				document: body[i * 2 + 1]
        			})
      			}
    		})
  		}
		return sendArray;
	}catch(error){
		console.log(error);
	}
}

function checkLogFrequency(){
  var checkDate = Date.now();
  //subtract above date from date set at line 41.
  var diffrence = checkDate - nowDate;
  //if difference is greater than TWITTER_SOCKET_TIMEOUT exit the process
  //we depend on pm2 to restart it if this happens.
  if(diffrence >= process.env.TWITTER_SOCKET_TIMEOUT){
    console.log("Exiting. Time difference is > 120000ms")
    process.exit(1)

  }
return
}