const Twitter = require('twitter');
const elastic = require('elasticsearch');
require('dotenv').config()

if(process.env.DEBUG){
	console.log(process.env);
	console.log(process.env.ELASTICSEARCH_USER+":"+process.env.ELASTICSEARCH_PASSWORD+"@"+process.env.ELASTICSEARCH_HOST);
}
var elasticClient = new elastic.Client({
  host: process.env.ELASTICSEARCH_USER+":"+process.env.ELASTICSEARCH_PASSWORD+"@"+process.env.ELASTICSEARCH_HOST,
  log: 'info',
    sniff: true,
    apiVersion: '7.x',
});

var twitterClient = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_TOKEN_SECRET
});

var sendArray = [];
var tweetCounter = 0;

twitterClient.stream('statuses/filter',{lang: process.env.TWITTER_LANG, track: process.env.TWITTER_TRACK, follow: process.env.TWITTER_FOLLOW},  function(stream) {
  stream.on('data', function(tweet) {
   	if(process.env.DEBUG){
    	console.log(tweet.user.screen_name);
    	console.log("------------------------------");
    }

    sendArray.push(tweet);
    if(tweetCounter >= process.env.ELASTICSEARCH_BATCH_SIZE){
    	if(process.env.DEBUG){
    		console.log("Time to Ingest "+tweetCounter+" tweets.");
    	}
    	bulkIndexTweets(sendArray);
    	sendArray = [];
    	tweetCounter = 0;
    }
   	++tweetCounter;
    nowDate = Date.now();

  });
 stream.on('error', function(error) {
    console.log(error);
  });
});

var nowDate = Date.now();
var myVar = setInterval(checkLogFrequency, 20000);


async function bulkIndexTweets(sendArray){
	try{
		if(process.env.DEBUG){
			console.log("Bulk Send Function")
			//console.log(sendArray);
		}
	  	const body = sendArray.flatMap(doc => [{ index: { _index: process.env.ELASTICSEARCH_INDEX } }, doc])
	  	const { body: bulkResponse } = await elasticClient.bulk({ refresh: true, body })
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
    		console.log(erroredDocuments)
  		}
		return sendArray;
	}catch(error){
		console.log(error);
	}
}

function checkLogFrequency(){
  var checkDate = Date.now();
  var diffrence = checkDate - nowDate;
  console.log("-----------------Tweet Time Difference: "+diffrence);
  if(diffrence >= 120000){
    console.log("Exiting. Time difference is > 120000ms")
    process.exit(1)

  }

}