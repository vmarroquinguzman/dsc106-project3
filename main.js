// DSC 106 Project 3
// Interactive visualizations using D3.js

const DATA_URL = 'data/processed/regional_monthly_fires.csv';
const REGIONS = ['Northern California', 'Central California', 'Southern California'];
const COLORS = {'Northern California':'#A65032','Central California':'#476B83','Southern California':'#849064'};
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fullExtent = [2003, 2025];
let selection = [...fullExtent];

async function start() {
    const status = d3.select('#data-status');
    try {
        const rows = await d3.csv(DATA_URL, d => ({
            region: d.region.trim(), year: +d.year, month: +d.month,
            detections: +d.detections, percent: +d.percent
        }));
        validate(rows);
        status.text('');
        buildDashboard(rows);
    } catch (error) {
        console.error(error);
        status.text(`Could not load the visualization: ${error.message}. Ensure ${DATA_URL} exists and run the site through a local web server or GitHub Pages.`);
    }
}

function validate(rows) {
    if (rows.length !== 828) throw new Error(`Expected 828 monthly records, found ${rows.length}`);
    const keys = new Set();
    for (const d of rows) {
        if (!REGIONS.includes(d.region) || !Number.isInteger(d.year) || d.year < 2003 || d.year > 2025 ||
            !Number.isInteger(d.month) || d.month < 1 || d.month > 12 ||
            !Number.isFinite(d.detections) || d.detections < 0 || !Number.isFinite(d.percent)) {
        throw new Error('The monthly dataset contains an invalid row');
        }
        const key = `${d.region}|${d.year}|${d.month}`;
        if (keys.has(key)) throw new Error(`Duplicate monthly observation: ${key}`);
        keys.add(key);
    }
    for (const region of REGIONS) for (let year = 2003; year <= 2025; year++) {
        const subset = rows.filter(d => d.region === region && d.year === year);
        if (subset.length !== 12 || Math.abs(d3.sum(subset, d => d.percent) - 100) > .01) {
        throw new Error(`Missing months or invalid percentages: ${region}, ${year}`);
        }
    }
}

function buildDashboard(data) {
  // The values are already normalized within each region-year in Python.
  // Averaging percentages assigns the same weight to each selected year.
    const avg = (region, lo, hi) => d3.range(1, 13).map(month => ({
        month,
        percent: d3.mean(data.filter(d => d.region === region && d.month === month && d.year >= lo && d.year <= hi), d => d.percent) ?? 0
    }));
    const refs = new Map(REGIONS.map(region => [region, avg(region, ...fullExtent)]));
    const byYear = d3.rollup(data, v => d3.sum(v, d => d.detections), d => d.year);
    const totals = d3.range(2003, 2026).map(year => ({year, detections: byYear.get(year) ?? 0}));
    const plots = d3.select('#regional-charts');
    let brushed;

    function render() {
        d3.select('#selected-years').text(selection[0] === selection[1] ? `${selection[0]}` : `${selection[0]}–${selection[1]}`);
        const chosen = new Map(REGIONS.map(region => [region, avg(region, ...selection)]));
        // One shared y-axis across three regions. Rescales when the period changes.
        const top = Math.max(10, d3.max([...chosen.values(), ...refs.values()].flat(), d => d.percent) || 10);
        const yMax = Math.ceil(top / 5) * 5;
        plots.selectAll('*').remove();
        REGIONS.forEach(region => drawRegion(plots, region, chosen.get(region), refs.get(region), yMax));
    }

    function drawRegion(parent, region, selected, reference, yMax) {
        const width = 920, height = 178;
        const m = {top:12,right:18,bottom:32,left:52};
        const w = width - m.left - m.right, h = height - m.top - m.bottom;
        const wrap = parent.append('div').attr('class','region-panel');
        const heading = wrap.append('div').attr('class','region-header');
        heading.append('span').attr('class','region-swatch').style('background', COLORS[region]);
        heading.append('h4').text(region);
        const svg = wrap.append('svg').attr('class','plot').attr('viewBox',`0 0 ${width} ${height}`)
        .attr('role','img').attr('aria-label',`${region}: average monthly percentage for ${selection[0]} to ${selection[1]} compared with 2003 to 2025`);
        const g = svg.append('g').attr('transform',`translate(${m.left},${m.top})`);
        const x = d3.scaleLinear().domain([1,12]).range([0,w]);
        const y = d3.scaleLinear().domain([0,yMax]).range([h,0]);
        g.append('g').attr('class','grid').call(d3.axisLeft(y).ticks(4).tickSize(-w).tickFormat('')).select('.domain').remove();
        g.append('g').call(d3.axisLeft(y).ticks(4).tickSizeOuter(0).tickFormat(d => `${d}%`));
        g.append('g').attr('transform',`translate(0,${h})`).call(d3.axisBottom(x).tickValues(d3.range(1,13)).tickFormat(d => MONTHS[d-1]).tickSizeOuter(0));
        const line = d3.line().x(d => x(d.month)).y(d => y(d.percent));
        g.append('path').datum(reference).attr('d',line).attr('fill','none').attr('stroke','#9C9A97').attr('stroke-width',2)
        .attr('stroke-dasharray','6 5');
        g.append('path').datum(selected).attr('d',line).attr('fill','none').attr('stroke',COLORS[region]).attr('stroke-width',3).attr('stroke-linejoin','round');
        const focus = g.append('g').style('display','none');
        focus.append('line').attr('y1',0).attr('y2',h).attr('stroke','#888').attr('stroke-dasharray','3 3');
        focus.append('circle').attr('r',5).attr('fill',COLORS[region]).attr('stroke','white').attr('stroke-width',2);
        g.append('rect').attr('width',w).attr('height',h).attr('fill','transparent').style('cursor','crosshair')
        .on('mousemove', function(event) {
            const mx = d3.pointer(event, this)[0];
            const month = Math.max(1, Math.min(12, Math.round(x.invert(mx))));
            const s = selected[month-1].percent, r = reference[month-1].percent;
            focus.style('display',null);
            focus.select('line').attr('transform',`translate(${x(month)},0)`);
            focus.select('circle').attr('cx',x(month)).attr('cy',y(s));
            d3.select('#hover-summary').text(`${region} · ${MONTHS[month-1]}: selected ${s.toFixed(1)}% · historical ${r.toFixed(1)}%`);
        }).on('mouseleave', () => {
            focus.style('display','none');
            d3.select('#hover-summary').text('Hover over a chart to compare monthly values.');
        });
    }

    function drawBrush() {
        const width = 920, height = 150;
        const m = {top:17,right:18,bottom:29,left:52};
        const w = width-m.left-m.right, h=height-m.top-m.bottom;
        const svg = d3.select('#year-chart').append('svg').attr('class','plot')
        .attr('viewBox',`0 0 ${width} ${height}`)
        .attr('role','img').attr('aria-label','Drag to select a year range between 2003 and 2025');
        const g = svg.append('g').attr('transform',`translate(${m.left},${m.top})`);
        const x = d3.scaleLinear().domain([2002.5,2025.5]).range([0,w]);
        const y = d3.scaleLinear().domain([0,(d3.max(totals,d=>d.detections)||0)*1.12]).range([h,0]);
        g.selectAll('rect.year-bar').data(totals).enter().append('rect').attr('class','year-bar')
        .attr('x',d=>x(d.year-.42)).attr('width', x(2003+.42)-x(2003-.42))
        .attr('y',d=>y(d.detections)).attr('height',d=>h-y(d.detections)).attr('fill','#B9A99D');
        g.append('g').attr('transform',`translate(0,${h})`)
        .call(d3.axisBottom(x).tickValues([2003,2007,2011,2015,2019,2023,2025]).tickFormat(d3.format('d')).tickSizeOuter(0));
        g.append('g').call(d3.axisLeft(y).ticks(3).tickFormat(d3.format('~s')).tickSizeOuter(0));
        brushed = d3.brushX().extent([[0,0],[w,h]]).on('brush',event => {
        if (!event.selection || !event.sourceEvent) return;
        const [a,b] = event.selection.map(x.invert);
        const lo = Math.max(2003,Math.min(2025,Math.round(a+.5)));
        const hi = Math.max(lo,Math.min(2025,Math.round(b-.5)));
        selection=[lo,hi];
        render();
        }).on('end',event => {
        if (!event.sourceEvent) return;
        if (!event.selection) { selection=[...fullExtent]; }
        else {
            const [a,b]=event.selection.map(x.invert);
            let lo=Math.max(2003,Math.min(2025,Math.round(a+.5)));
            let hi=Math.max(lo,Math.min(2025,Math.round(b-.5)));
            selection=[lo,hi];
        }
        g.select('.brush').call(brushed.move,[x(selection[0]-.5),x(selection[1]+.5)]);
        render();
        });
        g.append('g').attr('class','brush').call(brushed).call(brushed.move,[x(2002.5),x(2025.5)]);
        d3.select('#reset-years').on('click',() => {
        selection=[...fullExtent];
        g.select('.brush').call(brushed.move,[x(2002.5),x(2025.5)]);
        render();
        });
    }
    drawBrush();
    render();
}

start();