#!/bin/bash
WHOAMI=$(whoami)
echo ${WHOAMI}

THISIP=$(ip route | grep default | cut -d: -f2 | awk '{print $9}')
echo ${THISIP}

filename="nginx.conf-vendor"
sed -i "s/yourusername/$WHOAMI/" $filename
 
jsfilename="../html/js/twitter-client.js"
sed -i "s/localhost:8080/$THISIP/" $jsfilename

pm2 start ../servers/twitter-stream.js
echo "Sleeping 2 seconds for stream to settle\n";
sleep 2
pm2 start ../servers/twitter-websocket.js
