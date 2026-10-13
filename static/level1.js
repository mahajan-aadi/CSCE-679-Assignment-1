// -------------------------------------------------------
// CONFIGURATION CONSTANTS
// -------------------------------------------------------
const L1_CONFIG = {
    margin:       { top: 60, right: 150, bottom: 80, left: 60 },
    cellWidth:    40,  
    cellHeight:   40,  
	padding:      0.12,
    coldColor:    "#ffffcc", 
    hotColor:     "#800026",
};

const MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

// Global variables
let level1Data  = [];
let currentMode = "max";

fetch("/api/data/level1")
    .then(response => response.json())
    .then(data => {
        level1Data = data;
        drawLevel1Heatmap(data, currentMode);
    })
    .catch(error => console.error("Error loading Level 1 data:", error));

function switchMode(mode) {
    currentMode = mode;
    document.getElementById("btn-max").classList.toggle("active", mode === "max");
    document.getElementById("btn-min").classList.toggle("active", mode === "min");
    d3.select("#level1-chart").selectAll("*").remove();
    drawLevel1Heatmap(level1Data, mode);
}

function aggregateMonthlyData(data) {
    const maxGroups = {};
    const minGroups = {};

    data.forEach(row => {
        const yearMonth = row.date.substring(0, 7);
        if (!maxGroups[yearMonth]) {
            maxGroups[yearMonth] = [];
            minGroups[yearMonth] = [];
        }
        maxGroups[yearMonth].push(row.max_temperature);
        minGroups[yearMonth].push(row.min_temperature);
    });

    const maxAverages = {};
    const minAverages = {};
    Object.entries(maxGroups).forEach(([ym, temps]) => {
        maxAverages[ym] = +(temps.reduce((s,t) => s+t, 0) / temps.length).toFixed(1);
    });
    Object.entries(minGroups).forEach(([ym, temps]) => {
        minAverages[ym] = +(temps.reduce((s,t) => s+t, 0) / temps.length).toFixed(1);
    });

    return { maxAverages, minAverages };
}

function drawLevel1Heatmap(data, mode) {

    const { maxAverages, minAverages } = aggregateMonthlyData(data);

    const primaryData = mode === "max" ? maxAverages : minAverages;

    const years  = [...new Set(data.map(d => d.date.substring(0, 4)))].sort();
    const months = Array.from({ length: 12 }, (_, i) =>
        String(i + 1).padStart(2, "0")
    );

	const allTemps  = [
		...Object.values(maxAverages),
		...Object.values(minAverages)
	];
	const globalMin = d3.min(allTemps);
	const globalMax = d3.max(allTemps);
	
    const colorScale = d3.scaleSequential()
        .domain([globalMin, globalMax])
        .interpolator(d3.interpolateYlOrRd);

    const chartWidth  = years.length  * L1_CONFIG.cellWidth;
    const chartHeight = months.length * L1_CONFIG.cellHeight;
    const totalWidth  = chartWidth  + L1_CONFIG.margin.left + L1_CONFIG.margin.right;
    const totalHeight = chartHeight + L1_CONFIG.margin.top  + L1_CONFIG.margin.bottom;

    d3.select("#level1-chart").selectAll("*").remove();

    const svg = d3.select("#level1-chart")
        .append("svg")
        .attr("width",  totalWidth)
        .attr("height", totalHeight);

    const chartGroup = svg.append("g")
        .attr("transform",
              `translate(${L1_CONFIG.margin.left}, ${L1_CONFIG.margin.top})`);

    const xScale = d3.scaleBand()
        .domain(years).range([0, chartWidth]).padding(L1_CONFIG.padding);

    const yScale = d3.scaleBand()
        .domain(months).range([0, chartHeight]).padding(L1_CONFIG.padding);

    // Draw cells
    months.forEach(month => {
        years.forEach(year => {
            const yearMonth   = `${year}-${month}`;
            const temperature = primaryData[yearMonth];
            if (temperature === undefined) return;

            const maxTemp = maxAverages[yearMonth];
            const minTemp = minAverages[yearMonth];

            chartGroup.append("rect")
                .attr("class", "cell")
                .attr("x", xScale(year))
                .attr("y", yScale(month))
                .attr("width",  xScale.bandwidth())
                .attr("height", yScale.bandwidth())
                .attr("fill",   colorScale(temperature))
                .attr("stroke", "#fff")
                .attr("stroke-width", 0.5)
                .on("mouseover", function(event) {
                    const monthName = MONTH_NAMES[parseInt(month) - 1];
                    showTooltip(event,
                        `<strong>${monthName} ${year}</strong><br/>
                         Avg Max Temp: <strong>${maxTemp}°C</strong><br/>
                         Avg Min Temp: <strong>${minTemp}°C</strong>`
                    );
                    d3.select(this)
                        .attr("stroke", "#333")
                        .attr("stroke-width", 2);
                })
                .on("mousemove", moveTooltip)
                .on("mouseout", function() {
                    hideTooltip();
                    d3.select(this)
                        .attr("stroke", "#fff")
                        .attr("stroke-width", 0.5);
                });
        });
    });

    const xAxisGroup = chartGroup.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0, ${chartHeight})`)
        .call(d3.axisBottom(xScale));

    xAxisGroup.selectAll("text")
        .attr("transform", "rotate(-90)")
        .style("text-anchor", "end")
        .attr("dx", "-0.8em")
        .attr("dy", "-0.5em")
        .style("font-size", "11px");

    xAxisGroup.select(".domain").remove();

    chartGroup.append("g")
        .attr("class", "axis")
        .call(d3.axisLeft(yScale)
              .tickFormat((m) => MONTH_NAMES[parseInt(m) - 1]))
        .select(".domain").remove();

    const modeLabel = mode === "max" ? "Maximum" : "Minimum";
    svg.append("text")
        .attr("x", L1_CONFIG.margin.left + chartWidth / 2)
        .attr("y", 20)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .text(`Monthly Average ${modeLabel} Temperature — Hong Kong`);

    drawColorLegend(svg, colorScale, globalMin, globalMax,
        L1_CONFIG.margin.left + chartWidth + 20,
        L1_CONFIG.margin.top
    );
}


// -------------------------------------------------------
// DRAW COLOR LEGEND
// -------------------------------------------------------
function drawColorLegend(svg, colorScale, minTemp, maxTemp, x, y) {

    const legendHeight = 200;
    const legendWidth  = 15;

    const defs = svg.append("defs");
    const linearGradient = defs.append("linearGradient")
        .attr("id",  "legend-gradient-l1")
        .attr("x1",  "0%").attr("x2", "0%")
        .attr("y1", "100%").attr("y2", "0%");

    const numStops = 10;
    d3.range(numStops).forEach(i => {
        const t = i / (numStops - 1);
        linearGradient.append("stop")
            .attr("offset", `${t * 100}%`)
            .attr("stop-color", colorScale(minTemp + t * (maxTemp - minTemp)));
    });

    svg.append("rect")
        .attr("x", x)
        .attr("y", y)
        .attr("width",  legendWidth)
        .attr("height", legendHeight)
        .style("fill", "url(#legend-gradient-l1)");

    const legendScale = d3.scaleLinear()
        .domain([minTemp, maxTemp])
        .range([legendHeight, 0]);

    svg.append("g")
        .attr("transform", `translate(${x + legendWidth}, ${y})`)
        .call(
            d3.axisRight(legendScale)
              .ticks(6)
              .tickFormat(d => `${d}°C`)
        );

    svg.append("text")
        .attr("x", x)
        .attr("y", y - 8)
        .style("font-size", "11px")
        .style("font-weight", "bold")
        .text("Temp (°C)");
}


// -------------------------------------------------------
// TOOLTIP HELPER FUNCTIONS
// -------------------------------------------------------
function showTooltip(event, htmlContent) {
    const tooltip = document.getElementById("tooltip");
    tooltip.innerHTML    = htmlContent;
    tooltip.style.opacity = "1";
    moveTooltip(event);
}

function moveTooltip(event) {
    const tooltip = document.getElementById("tooltip");
    tooltip.style.left = (event.pageX + 12) + "px";
    tooltip.style.top  = (event.pageY - 28) + "px";
}

function hideTooltip() {
    document.getElementById("tooltip").style.opacity = "0";
}