const OTHER_COLOR = "#A9A9A9";

d3.json("data.json").then(function (data) {

    const containerEl = document.querySelector("#graph-container");
    const width = containerEl.clientWidth;
    const height = containerEl.clientHeight;

    const svgContainer = d3.select("#graph-container").select("svg")
        .attr("viewBox", [0, 0, width, height])
        .attr("preserveAspectRatio", "xMidYMid meet");

    const graphGroup = svgContainer.append("g");
    let tooltipNode = null;

    const zoom = d3.zoom()
        .scaleExtent([0.02, 8])
        .on("zoom", (event) => {
            graphGroup.attr("transform", event.transform);
            positionTooltip();
        });

    svgContainer.call(zoom).on("dblclick.zoom", null);

    const maxDegree = d3.max(data.nodes, d => d.degree) || 1;
    const radiusScale = d3.scaleSqrt().domain([0, maxDegree]).range([3, 20]);

    const tooltip = d3.select("#tooltip");
    const runButton = document.querySelector("#runButton");
    let isRunning = false;
    let selectedCountry = null;

    function setRunning(running) {
        isRunning = running;
        runButton.textContent = running ? "Stop" : "Go";
    }

    function positionTooltip() {
        if (!tooltipNode) return;
        const [x, y] = d3.zoomTransform(svgContainer.node()).apply([tooltipNode.x, tooltipNode.y]);
        const tooltipElement = tooltip.node();
        const left = Math.max(8, Math.min(x + 14, width - tooltipElement.offsetWidth - 8));
        const top = Math.max(8, Math.min(y + 14, height - tooltipElement.offsetHeight - 8));
        tooltip.style("left", `${left}px`).style("top", `${top}px`);
    }

    // slider-controlled force parameters
    const params = {
        charge: +document.querySelector("#chargeSlider").value,
        linkDistance: +document.querySelector("#linkDistanceSlider").value,
        linkStrength: +document.querySelector("#linkStrengthSlider").value,
        collideFactor: +document.querySelector("#collideSlider").value,
    };

    const simulation = d3.forceSimulation(data.nodes)
        .force("link", d3.forceLink(data.links).id(d => d.id)
            .distance(params.linkDistance)
            .strength(params.linkStrength))
        .force("charge", d3.forceManyBody().strength(params.charge))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(d => radiusScale(d.degree) * params.collideFactor + 2))
        .alphaDecay(0.06)
        .on("tick", ticked)
        .on("end", () => {
            setRunning(false);
            fitToViewOnce();
        });

    data.nodes.forEach(d => {
        d.x += width / 2;
        d.y += height / 2;
    });
    simulation.stop();

    // the force layout spreads far beyond the viewBox with ~1500 nodes; zoom-to-fit once it settles
    let didInitialFit = false;
    function fitToViewOnce() {
        if (didInitialFit) return;
        didInitialFit = true;
        const bounds = graphGroup.node().getBBox();
        if (bounds.width === 0 || bounds.height === 0) return;
        const scale = Math.min(width / bounds.width, height / bounds.height, 2) * 0.9;
        // allow zooming back out past the fitted scale, since content can be much larger than the viewport
        zoom.scaleExtent([Math.min(0.02, scale * 0.5), 8]);
        const translateX = width / 2 - scale * (bounds.x + bounds.width / 2);
        const translateY = height / 2 - scale * (bounds.y + bounds.height / 2);
        svgContainer.transition().duration(500)
            .call(zoom.transform, d3.zoomIdentity.translate(translateX, translateY).scale(scale));
    }

    const link = graphGroup.append("g")
        .selectAll("line")
        .data(data.links)
        .join("line")
        .attr("stroke", "#999")
        .attr("stroke-opacity", 0.6);

    const node = graphGroup.append("g")
        .selectAll("circle")
        .data(data.nodes)
        .join("circle")
        .attr("r", d => radiusScale(d.degree))
        .attr("fill", d => d.color)
        .attr("stroke", "#555")
        .attr("stroke-width", 1)
        .call(drag(simulation))
        .on("mouseenter", handleMouseEnter)
        .on("mouseleave", handleMouseLeave)
        .on("click", handleClick);

    ticked();

    function ticked() {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);

        positionTooltip();
    }

    function drag(simulation) {
        const draggedNodes = new WeakSet();
        return d3.drag()
            .on("start", (event, d) => {
                d.fx = d.x;
                d.fy = d.y;
            })
            .on("drag", (event, d) => {
                if (!draggedNodes.has(d)) {
                    draggedNodes.add(d);
                    simulation.alphaTarget(0.3).restart();
                    setRunning(true);
                }
                d.fx = event.x;
                d.fy = event.y;
            })
            .on("end", (event, d) => {
                if (draggedNodes.has(d)) {
                    draggedNodes.delete(d);
                    if (!event.active) simulation.alphaTarget(0);
                }
                d.fx = null;
                d.fy = null;
            });
    }

    function handleMouseEnter(event, hovered) {
        if (selectedCountry === null) highlightCountry(hovered.country);
    }

    function handleMouseLeave() {
        if (selectedCountry === null) clearHighlight();
    }

    function highlightCountry(country) {
        node.attr("opacity", d => d.country === country ? 1 : 0.2);
        link.attr("opacity", l => (l.source.country === country && l.target.country === country) ? 0.6 : 0.05);
    }

    function clearHighlight() {
        node.attr("opacity", 1);
        link.attr("opacity", 0.6);
    }

    function handleClick(event, d) {
        selectedCountry = d.country;
        tooltipNode = d;
        highlightCountry(selectedCountry);
        tooltip
            .style("opacity", 1)
            .html(`
                <strong>${d.name}</strong><br>
                Country: ${d.country}<br>
                Co-authored papers (degree): ${d.degree}
            `);
        positionTooltip();
        event.stopPropagation();
    }

    svgContainer.on("click", () => {
        selectedCountry = null;
        tooltipNode = null;
        clearHighlight();
        tooltip.style("opacity", 0);
    });

    buildLegend(data.nodes);
    wireControls(simulation);

    function buildLegend(nodes) {
        const colorToCountry = new Map();
        for (const n of nodes) {
            if (n.color !== OTHER_COLOR && !colorToCountry.has(n.color)) {
                colorToCountry.set(n.color, n.country);
            }
        }
        const items = [...colorToCountry.entries()].map(([color, country]) => ({ color, country }));
        items.push({ color: OTHER_COLOR, country: "Other" });

        const legend = d3.select("#legend-items")
            .selectAll(".legend-item")
            .data(items)
            .join("div")
            .attr("class", "legend-item");

        legend.append("span")
            .attr("class", "legend-swatch")
            .style("background", d => d.color);

        legend.append("span")
            .text(d => d.country);
    }

    function wireControls(simulation) {
        const chargeSlider = document.querySelector("#chargeSlider");
        const linkDistanceSlider = document.querySelector("#linkDistanceSlider");
        const linkStrengthSlider = document.querySelector("#linkStrengthSlider");
        const collideSlider = document.querySelector("#collideSlider");
        const resetButton = document.querySelector("#resetButton");
        const beginningButton = document.querySelector("#beginningButton");

        const chargeValue = document.querySelector("#chargeValue");
        const linkDistanceValue = document.querySelector("#linkDistanceValue");
        const linkStrengthValue = document.querySelector("#linkStrengthValue");
        const collideValue = document.querySelector("#collideValue");

        // the slider markup's initial `value` attributes double as the reset defaults
        const DEFAULTS = {
            charge: +chargeSlider.defaultValue,
            linkDistance: +linkDistanceSlider.defaultValue,
            linkStrength: +linkStrengthSlider.defaultValue,
            collideFactor: +collideSlider.defaultValue,
        };

        function applyCharge(value) {
            chargeSlider.value = value;
            chargeValue.textContent = value;
            simulation.force("charge", d3.forceManyBody().strength(value));
        }

        function applyLinkDistance(value) {
            linkDistanceSlider.value = value;
            linkDistanceValue.textContent = value;
            simulation.force("link").distance(value);
        }

        function applyLinkStrength(value) {
            linkStrengthSlider.value = value;
            linkStrengthValue.textContent = value;
            simulation.force("link").strength(value);
        }

        function applyCollideFactor(value) {
            collideSlider.value = value;
            collideValue.textContent = value;
            simulation.force("collision").radius(d => radiusScale(d.degree) * value + 2);
        }

        applyCharge(DEFAULTS.charge);
        applyLinkDistance(DEFAULTS.linkDistance);
        applyLinkStrength(DEFAULTS.linkStrength);
        applyCollideFactor(DEFAULTS.collideFactor);

        chargeSlider.addEventListener("input", () => {
            applyCharge(+chargeSlider.value);
        });

        linkDistanceSlider.addEventListener("input", () => {
            applyLinkDistance(+linkDistanceSlider.value);
        });

        linkStrengthSlider.addEventListener("input", () => {
            applyLinkStrength(+linkStrengthSlider.value);
        });

        collideSlider.addEventListener("input", () => {
            applyCollideFactor(+collideSlider.value);
        });

        runButton.addEventListener("click", () => {
            if (isRunning) {
                simulation.stop();
                setRunning(false);
            } else {
                setRunning(true);
                simulation.alpha(1).restart();
            }
        });

        beginningButton.addEventListener("click", () => {
            simulation.stop();
            setRunning(false);
            data.nodes.forEach(d => {
                d.x = undefined;
                d.y = undefined;
                d.vx = undefined;
                d.vy = undefined;
                d.fx = null;
                d.fy = null;
            });
            simulation.nodes(data.nodes);
            simulation.force("link").links(data.links);
            didInitialFit = false;
            zoom.scaleExtent([0.02, 8]);
            svgContainer.interrupt().call(zoom.transform, d3.zoomIdentity);
            setRunning(true);
            simulation.alpha(1).restart();
        });

        resetButton.addEventListener("click", () => {
            applyCharge(DEFAULTS.charge);
            applyLinkDistance(DEFAULTS.linkDistance);
            applyLinkStrength(DEFAULTS.linkStrength);
            applyCollideFactor(DEFAULTS.collideFactor);
        });
    }

}).catch(error => {
    console.error("Failed to load data.json:", error);
});
