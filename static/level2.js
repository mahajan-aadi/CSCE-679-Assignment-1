// -------------------------------------------------------
// CONFIGURATION CONSTANTS
// -------------------------------------------------------
const L2_CONFIG = {
    margin:      { top: 60, right: 150, bottom: 60, left: 80 },
    cellWidth:   60, 
    cellHeight:  50, 
    padding:     3,
    maxColor:    "#2b8cbe",
    minColor:    "#00ff00", 
    legendWidth: 120,
};

let level2Data      = [];
let currentMode2    = "max"; 


// -------------------------------------------------------
// Fetches the last 10 years of data and draws the chart
// -------------------------------------------------------
fetch("/api/data/level2")
    .then(response => response.json())
    .then(data => {
        level2Data = data;
        drawLevel2Heatmap(data, currentMode2);
    })
    .catch(error => console.error("Error loading Level 2 data:", error));


// -------------------------------------------------------
// SWITCH MODE FOR LEVEL 2
// -------------------------------------------------------
function switchMode2(mode) {
    currentMode2 = mode;

    // Update button active states
    document.getElementById("btn2-max").classList.toggle("active", mode === "max");
    document.getElementById("btn2-min").classList.toggle("active", mode === "min");

    // Clear and redraw
    d3.select("#level2-chart").selectAll("*").remove();
    drawLevel2Heatmap(level2Data, mode);
}


// -------------------------------------------------------
// DATA GROUPING
// Groups daily data by year-month, returning a map:
// { "YYYY-MM": [ { day: 1, value: 25 }, ... ] }
// -------------------------------------------------------
function groupDailyData(data, mode) {
    const groups  = {};

    data.forEach(row => {
        const yearMonth = row.date.substring(0, 7);  // "YYYY-MM"
        const day       = parseInt(row.date.substring(8, 10)); // day number

        if (!groups[yearMonth]) {
            groups[yearMonth] = [];
        }
        groups[yearMonth].push({
            day:   day,
			maxTemp: row.max_temperature,
			minTemp: row.min_temperature
        });
    });

    // Sort each group by day
    Object.keys(groups).forEach(key => {
        groups[key].sort((a, b) => a.day - b.day);
    });

    return groups;
}


// -------------------------------------------------------
// COMPUTE GLOBAL TEMPERATURE RANGE
// Used to keep all mini line charts on the same Y scale
// so they are visually comparable across cells
// -------------------------------------------------------
function computeGlobalTempRange(data, mode) {
    const tempKey = mode === "max" ? "max_temperature" : "min_temperature";
    const allTemps = data.map(d => d[tempKey]);
    return {
        min: d3.min(allTemps),
        max: d3.max(allTemps)
    };
}


// -------------------------------------------------------
// COMPUTE MONTHLY AVERAGE
// Used to color-code the cell background by average temp
// -------------------------------------------------------
function computeMonthlyAverage(dailyValues) {
    const totalMax = dailyValues.reduce((sum, d) => sum + d.maxTemp, 0);
    const totalMin = dailyValues.reduce((sum, d) => sum + d.minTemp, 0);
    return {
        max: totalMax / dailyValues.length,
        min: totalMin / dailyValues.length
    };
}


// -------------------------------------------------------
// MAIN DRAW FUNCTION
// Draws the Level 2 heatmap with mini line charts
// -------------------------------------------------------
function drawLevel2Heatmap(data, mode) {

	
    // --- 1. Group data by year-month ---
    const dailyGroups = groupDailyData(data, mode);

    // --- 2. Extract unique sorted years and months ---
    const years  = [...new Set(data.map(d => d.date.substring(0, 4)))].sort();
    const months = Array.from({ length: 12 }, (_, i) =>
        String(i + 1).padStart(2, "0")
    );

    // --- 3. Compute global temperature range for consistent Y scales ---
    const globalRange = computeGlobalTempRange(data, mode);

    // --- 4. Compute monthly averages for background color ---
    const monthlyAverages = {};
    Object.entries(dailyGroups).forEach(([yearMonth, dailyValues]) => {
        monthlyAverages[yearMonth] = computeMonthlyAverage(dailyValues);
    });

    // --- 5. Compute chart dimensions ---
    const chartWidth  = years.length  * L2_CONFIG.cellWidth;
    const chartHeight = months.length * L2_CONFIG.cellHeight;
    const totalWidth  = chartWidth  + L2_CONFIG.margin.left + L2_CONFIG.margin.right;
    const totalHeight = chartHeight + L2_CONFIG.margin.top  + L2_CONFIG.margin.bottom;

    // --- 6. Create SVG ---
    const svg = d3.select("#level2-chart")
        .append("svg")
        .attr("width",  totalWidth)
        .attr("height", totalHeight);

    // Main group shifted by margins
    const chartGroup = svg.append("g")
        .attr("transform",
              `translate(${L2_CONFIG.margin.left}, ${L2_CONFIG.margin.top})`);

    // --- 7. Scales ---

    // X scale: maps year strings to pixel positions
    const xScale = d3.scaleBand()
        .domain(years)
        .range([0, chartWidth])
        .padding(0.05);

    // Y scale: maps month strings to pixel positions
    const yScale = d3.scaleBand()
        .domain(months)
        .range([0, chartHeight])
        .padding(0.05);

    const allAverages  = Object.values(monthlyAverages).map(d => mode === "max" ? d.max : d.min);
    const avgMin       = d3.min(allAverages);
    const avgMax       = d3.max(allAverages);

    const bgColorScale = d3.scaleSequential()
        .domain([avgMin, avgMax])
        .interpolator(d3.interpolateYlOrRd);

    // --- 8. Draw each cell ---
    months.forEach(month => {
        years.forEach(year => {
            const yearMonth  = `${year}-${month}`;
            const dailyData  = dailyGroups[yearMonth];

            if (!dailyData || dailyData.length === 0) return;

            const cellX = xScale(year);
            const cellY = yScale(month);
			
			const cellW  = xScale.bandwidth();
			const cellH  = yScale.bandwidth();

			const averages = monthlyAverages[yearMonth];
			const cellColorValue = mode === "max" ? averages.max : averages.min;

			chartGroup.append("rect")
				.attr("x", cellX)
				.attr("y", cellY)
				.attr("width",  cellW)
				.attr("height", cellH)
				.attr("fill",   bgColorScale(cellColorValue))
				.attr("stroke", "#fff")
				.attr("stroke-width", 1)
				.on("mouseover", function(event) {
					const monthName = MONTH_NAMES[parseInt(month) - 1];
					const displayMax = averages.max.toFixed(1);
                    const displayMin = averages.min.toFixed(1);
					showTooltip(event,
						`<strong>${monthName} ${year}</strong><br/>
						 Avg Max Temp: <strong>${displayMax}°C</strong><br/>
                         Avg Min Temp: <strong>${displayMin}°C</strong><br/>
						 Days: ${dailyData.length}`
					);
				})
				.on("mousemove", moveTooltip)
				.on("mouseout",  hideTooltip);

			drawMiniLineChart(
				chartGroup,
				dailyData,
				cellX, cellY,
				cellW, cellH,
				globalRange
			);			
        });
    });

    // --- 9. X Axis (Years) ---
	const xAxisGroup = chartGroup.append("g")
		.attr("class", "axis")
		.attr("transform", `translate(0, ${chartHeight})`)
		.call(
			d3.axisBottom(xScale)
		);

    xAxisGroup.selectAll("text")
        .attr("transform", "rotate(-45)")
        .style("text-anchor", "end")
        .attr("dx", "-0.5em")
        .attr("dy", "0.15em");

    // X axis label
    svg.append("text")
        .attr("x", L2_CONFIG.margin.left + chartWidth / 2)
        .attr("y", totalHeight - 5)
        .attr("text-anchor", "middle")
        .style("font-size", "13px")
        .text("Year");

    // --- 10. Y Axis (Months) ---
    chartGroup.append("g")
        .attr("class", "axis")
        .call(
            d3.axisLeft(yScale)
              .tickFormat((monthNum) => MONTH_NAMES[parseInt(monthNum) - 1])
        );

    // Y axis label
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -(L2_CONFIG.margin.top + chartHeight / 2))
        .attr("y", 18)
        .attr("text-anchor", "middle")
        .style("font-size", "13px")
        .text("Month");

    // --- 11. Title ---
    const modeLabel = mode === "max" ? "Maximum" : "Minimum";
    svg.append("text")
        .attr("x", L2_CONFIG.margin.left + chartWidth / 2)
        .attr("y", 20)
        .attr("text-anchor", "middle")
        .style("font-size", "15px")
        .style("font-weight", "bold")
        .text(`Daily ${modeLabel} Temperature Changes — Last 10 Years`);

    // --- 12. Line Chart Legend ---
    drawLevel2Legend(
        svg,
        L2_CONFIG.margin.left + chartWidth + 20,
        L2_CONFIG.margin.top,
        mode
    );
}


// -------------------------------------------------------
// DRAW MINI LINE CHART
// Draws a small line chart inside a single heatmap cell
// -------------------------------------------------------
function drawMiniLineChart(parentGroup, dailyData, cellX, cellY, cellW, cellH, globalRange) {
    const padding = L2_CONFIG.padding;
    const innerW  = cellW - padding * 2;
    const innerH  = cellH - padding * 2;

    const cellGroup = parentGroup.append("g")
        .attr("transform", `translate(${cellX + padding}, ${cellY + padding})`)
        .style("pointer-events", "none");

    const maxDay = d3.max(dailyData, d => d.day);
    const miniX  = d3.scaleLinear().domain([1, maxDay]).range([0, innerW]);

    const miniY  = d3.scaleLinear()
        .domain([globalRange.min, globalRange.max])
        .range([innerH, 0]);

    const maxLine = d3.line()
        .x(d => miniX(d.day))
        .y(d => miniY(d.maxTemp))
        .curve(d3.curveMonotoneX);

    const minLine = d3.line()
        .x(d => miniX(d.day))
        .y(d => miniY(d.minTemp))
        .curve(d3.curveMonotoneX);

    cellGroup.append("path")
        .datum(dailyData)
        .attr("fill",         "none")
        .attr("stroke",       L2_CONFIG.maxColor)
        .attr("stroke-width", 1.5)
        .attr("d", maxLine);

    cellGroup.append("path")
        .datum(dailyData)
        .attr("fill",         "none")
        .attr("stroke",       L2_CONFIG.minColor)
        .attr("stroke-width", 1.5)
        .attr("d", minLine);
}

// -------------------------------------------------------
// DRAW LEVEL 2 LEGEND
// Shows line color meaning and a smooth temperature color gradient bar
// -------------------------------------------------------
function drawLevel2Legend(svg, x, y) {
    const legendGroup = svg.append("g")
        .attr("transform", `translate(${x}, ${y})`);
        
    // --- PART A: Line Guides ---
    legendGroup.append("text")
        .attr("x", 0).attr("y", 0)
        .style("font-size",   "12px")
        .style("font-weight", "bold")
        .text("Legend");
        
    legendGroup.append("line")
        .attr("x1", 0).attr("y1", 20)
        .attr("x2", 30).attr("y2", 20)
        .attr("stroke", L2_CONFIG.maxColor)
        .attr("stroke-width", 2)
        .style("filter", "drop-shadow(0px 1px 1px rgba(0,0,0,0.3))"); 
        
    legendGroup.append("text")
        .attr("x", 35).attr("y", 24)
        .style("font-size", "11px")
        .text("Max Temp (daily)");

    legendGroup.append("line")
        .attr("x1", 0).attr("y1", 40)
        .attr("x2", 30).attr("y2", 40)
        .attr("stroke", L2_CONFIG.minColor)
        .attr("stroke-width", 2);
        
    legendGroup.append("text")
        .attr("x", 35).attr("y", 44)
        .style("font-size", "11px")
        .text("Min Temp (daily)");

    // --- PART B: Smooth Temperature Gradient Bar ---
    const cellColorY = 70;
    legendGroup.append("text")
        .attr("x", 0).attr("y", cellColorY)
        .style("font-size",   "12px")
        .style("font-weight", "bold")
        .text("Cell Color");
        
    legendGroup.append("text")
        .attr("x", 0).attr("y", cellColorY + 15)
        .style("font-size", "11px")
        .style("fill", "#555")
        .text("Avg monthly temp");

    const legendHeight = 200;
    const legendWidth  = 15;
    const gradientId = "legend-gradient-l2";
    
    const defs = svg.select("defs").empty() ? svg.append("defs") : svg.select("defs");
    defs.select(`#${gradientId}`).remove(); 
    
    const linearGradient = defs.append("linearGradient")
        .attr("id", gradientId)
        .attr("x1", "0%").attr("x2", "0%")
        .attr("y1", "100%").attr("y2", "0%");

    const numStops = 10;
    d3.range(numStops).forEach(i => {
        const t = i / (numStops - 1);
        linearGradient.append("stop")
            .attr("offset", `${t * 100}%`)
            .attr("stop-color", d3.interpolateYlOrRd(t));
    });

    const barYStart = cellColorY + 24;
    
    // Draw the continuous color gradient box
    legendGroup.append("rect")
        .attr("x", 0)
        .attr("y", barYStart)
        .attr("width",  legendWidth)
        .attr("height", legendHeight)
        .style("fill", `url(#${gradientId})`)
        .attr("stroke", "#ccc")
        .attr("stroke-width", 0.5);

    const legendScale = d3.scaleLinear()
        .domain([10, 35])
        .range([legendHeight, 0]);

    legendGroup.append("g")
        .attr("transform", `translate(${legendWidth}, ${barYStart})`)
        .call(
            d3.axisRight(legendScale)
              .ticks(4)
              .tickFormat(d => `${d}°C`)
        )
        .style("font-size", "10px")
        .select(".domain").remove(); // Strip default native line rendering clean

    // --- PART C: Technical Metric Subtext (Untouched) ---
    legendGroup.append("text")
        .attr("x", 0).attr("y", barYStart + legendHeight + 20)
        .style("font-size", "10px")
        .style("fill", "#777")
        .text("Y scale: global range");
        
    legendGroup.append("text")
        .attr("x", 0).attr("y", barYStart + legendHeight + 33)
        .style("font-size", "10px")
        .style("fill", "#777")
}
