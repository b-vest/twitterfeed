//set to client websocket. For this project this will be the websocket we created with twitter-websocket.js
var ws = new WebSocket("ws://192.168.2.192:8080/");
//Set new graph variable for testing if a new network graph needs to be built
var newGraph;
//Do this when new message comes from websocket

ws.onopen = function(e) {
//send websocket message that we want the data so 
//we don't have to wait for the websocket server update timer
  ws.send("start");
};
ws.onmessage = function(evt) {
    var received_msg = evt.data;
    console.log("Message is received...");
    //convert data from websocket to JSON object
    var jsonData = JSON.parse(received_msg);
    console.log(jsonData);
    if(!newGraph){
        //if this is the first data packet build the network graph
        buildD3NetworkGraph(jsonData.data)
        newGraph = 1;
    }
    //always build the bar chart.
    buildD3BarChart(jsonData.data.barchart)

};

function buildD3BarChart(d3Data) {
    //clear the barchart div otherwise new axis will stack on top of old axis
    d3.selectAll("#userBarDiv > *").remove();
    //create the svg object and give it the bargraph div
    const svg = d3.select("#userBarDiv"),
        margin = {
            top: 20,
            right: 20,
            bottom: 80,
            left: 40
        },
        //height and width are hardset. 
        //For some reason reading the dimensions of the div does not work here
        width = 800, 
        height = 300,
        // set the x and y scales based on width and height
        x = d3.scaleBand().rangeRound([0, width]).padding(0.2),
        y = d3.scaleLinear().rangeRound([height, 0]),
        g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);
    console.log(width, height)
    var data = d3Data;

    //these set the max extent of the. On the x domain it is a count of the number of users, 
    //hence the number of bars that will be drawn
    //the y domain is the maximum value that a single bar can be, this sets that maximum.
    x.domain(data.map(d => d.User));
    y.domain([0, d3.max(data, d => d.Value)]);

    //This sets the html object attributes for the graph
    g.append("g")
        .attr("class", "axis axis-x")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .style("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em")
        .attr("transform", "rotate(-65)");;

    g.append("g")
        .attr("class", "axis axis-y")
        .call(d3.axisLeft(y).ticks(10));

        //Besides setting maximums on the x and y domains this is where the 
        //data we prepared somes into play. This will draw a standard vertical
        //bar chart. the x values are read from the User key and the y, or height
        //of the bars will be set by the Value key that we sent from the websocket.
        //the .attr height sets the height of the chart based on the Value
    g.selectAll(".bar")
        .data(data)
        .enter().append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.User))
        .attr("y", d => y(d.Value))
        .attr("width", x.bandwidth())
        .attr("height", d => height - y(d.Value));

}

function buildD3NetworkGraph(d3Data) {
    console.log(d3Data)

    // set the dimensions and margins of the graph
    //As complex as this function might seem our data
    //only comes into play in three places. Everything else
    //are functions to assist the zoooming and the dragging of
    //network graph.
    var width = document.getElementById("networkSVG").offsetWidth;
    var height = document.getElementById("networkSVG").offsetHeight;

    var svg = d3.select("#networkSVG")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .call(d3.zoom().on("zoom", function() {
            svg.attr("transform", d3.event.transform)
        }))
        .append("g")

    var color = d3.scaleOrdinal(d3.schemeCategory20);

    //This is the first place that our data is used.
    //here it is used to calculate the force simulation between
    //the nodes and the links. 
    const simulation = d3.forceSimulation(d3Data.nodes)
        .force('charge', d3.forceManyBody().strength(-100))
        .force('link', d3.forceLink(d3Data.links).id(d => d.id)
            .distance(35))
        .force('center', d3.forceCenter(width / 2, height / 2))

    //The data is used again here to actually draw the links that were calculated above.
    var link = svg.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(d3Data.links)
        .enter().append("line")
        .attr("stroke-width", function(d) {
            return Math.sqrt(d.value);
        });
    //The data isused again here to create the node object that will be turned into a circle
    //below at var circles.
    var node = svg.append("g")
        .attr("class", "nodes")
        .selectAll("g")
        .data(d3Data.nodes)
        .enter().append("g")
    //add drag capabilities  

    var circles = node.append("circle")
        .attr("r", 3)
        .attr("fill", function(d) {
            return color(d.group);
        });

    // Create a drag handler and append it to the node object instead
    var drag_handler = d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);

    drag_handler(node);
    //Create label for adding text to node
    var lables = node.append("text")
        .text(function(d) {
            return d.id;
        })
        .attr('x', 4)
        .attr('y', 4);

    node.append("title")
        .text(function(d) {
            return d.id;
        });
        //Start the simulation of nodes.
    simulation
        .nodes(d3Data.nodes)
        .on("tick", ticked);

    var g = svg.append("g")
        .attr("class", "everything");
    var drag_handler = d3.drag()
        .on("start", drag_start)
        .on("drag", drag_drag)
        .on("end", drag_end);

    drag_handler(node);


    //add zoom capabilities 
    var zoom_handler = d3.zoom()
        .on("zoom", zoom_actions);

    zoom_handler(svg);

    function drag_start(d) {
        if (!d3.event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    //make sure you can't drag the circle outside the box
    function drag_drag(d) {
        d.fx = d3.event.x;
        d.fy = d3.event.y;
    }

    function drag_end(d) {
        if (!d3.event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    //Zoom functions 
    function zoom_actions() {
        g.attr("transform", d3.event.transform)

    }



    function ticked() {
        link
            .attr("x1", function(d) {
                return d.source.x;
            })
            .attr("y1", function(d) {
                return d.source.y;
            })
            .attr("x2", function(d) {
                return d.target.x;
            })
            .attr("y2", function(d) {
                return d.target.y;
            });

        node
            .attr("transform", function(d) {
                return "translate(" + d.x + "," + d.y + ")";
            })
    }

    function dragstarted(d) {
        if (!d3.event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    function dragged(d) {
        d.fx = d3.event.x;
        d.fy = d3.event.y;
    }

    function dragended(d) {
        if (!d3.event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }
}
