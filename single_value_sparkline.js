/**
 * Single Value + Sparkline Custom Visualization for Looker
 *
 * Features:
 *   - Big number with sparkline trend
 *   - Click-to-drill on the big number (opens Looker's native drill menu)
 *   - Hover tooltips on sparkline data points (date + value)
 *   - Respects LookML value_format when available
 *   - Period comparison (split-half)
 *   - Configurable via viz edit panel
 *
 * Expects: 1 date dimension + 1 measure
 * Dependencies: none — pure JS + inline SVG
 */

looker.plugins.visualizations.add({

  options: {
    // -- Value display --
    value_label: {
      type: "string",
      label: "Title Label",
      default: "",
      section: "Value",
      order: 1
    },
    value_format: {
      type: "string",
      label: "Value Format",
      default: "looker",
      display: "select",
      values: [
        { "Use LookML Format": "looker" },
        { "Auto (1.2M / 1.2K)": "auto" },
        { "Full Number (1,234,567)": "number" },
        { "Short (1.2M)": "short" },
        { "Raw": "raw" }
      ],
      section: "Value",
      order: 2
    },
    value_color: {
      type: "string",
      label: "Value Color",
      default: "#1a1a2e",
      display: "color",
      section: "Value",
      order: 3
    },
    value_size: {
      type: "string",
      label: "Value Font Size",
      default: "auto",
      display: "select",
      values: [
        { "Auto": "auto" },
        { "Small": "24" },
        { "Medium": "36" },
        { "Large": "48" },
        { "Extra Large": "60" }
      ],
      section: "Value",
      order: 4
    },
    value_calculation: {
      type: "string",
      label: "Big Number Shows",
      default: "sum",
      display: "select",
      values: [
        { "Sum of All Rows": "sum" },
        { "Most Recent Row": "last" }
      ],
      section: "Value",
      order: 5
    },

    // -- Sparkline --
    sparkline_color: {
      type: "string",
      label: "Sparkline Color",
      default: "#4285F4",
      display: "color",
      section: "Sparkline",
      order: 1
    },
    sparkline_weight: {
      type: "string",
      label: "Line Thickness",
      default: "2",
      display: "select",
      values: [
        { "Thin": "1.5" },
        { "Normal": "2" },
        { "Thick": "3" }
      ],
      section: "Sparkline",
      order: 2
    },
    show_sparkline: {
      type: "boolean",
      label: "Show Sparkline",
      default: true,
      section: "Sparkline",
      order: 3
    },

    // -- Comparison --
    show_comparison: {
      type: "boolean",
      label: "Show Period Comparison",
      default: true,
      section: "Comparison",
      order: 1
    },
    comparison_label: {
      type: "string",
      label: "Comparison Label",
      default: "vs. prior period",
      section: "Comparison",
      order: 2
    },
    positive_is_good: {
      type: "boolean",
      label: "Positive Change is Good",
      default: true,
      section: "Comparison",
      order: 3
    }
  },

  create: function(element, config) {
    element.innerHTML = "";

    var style = document.createElement("style");
    style.textContent = [
      ".sv-spark-container {",
      "  font-family: 'Google Sans', 'Helvetica Neue', Arial, sans-serif;",
      "  display: flex;",
      "  flex-direction: column;",
      "  justify-content: center;",
      "  align-items: flex-start;",
      "  height: 100%;",
      "  width: 100%;",
      "  padding: 16px 20px;",
      "  box-sizing: border-box;",
      "  overflow: hidden;",
      "}",
      ".sv-spark-label {",
      "  font-size: 13px;",
      "  font-weight: 500;",
      "  color: #5f6368;",
      "  margin-bottom: 4px;",
      "  letter-spacing: 0.01em;",
      "  white-space: nowrap;",
      "  overflow: hidden;",
      "  text-overflow: ellipsis;",
      "  max-width: 100%;",
      "}",
      ".sv-spark-value-row {",
      "  display: flex;",
      "  align-items: flex-end;",
      "  justify-content: flex-start;",
      "  gap: 20px;",
      "}",
      ".sv-spark-value {",
      "  font-weight: 600;",
      "  line-height: 1.1;",
      "  white-space: nowrap;",
      "  cursor: pointer;",
      "}",
      ".sv-spark-value:hover {",
      "  text-decoration: underline;",
      "  text-decoration-style: dotted;",
      "  text-underline-offset: 4px;",
      "}",
      ".sv-spark-chart {",
      "  flex-shrink: 0;",
      "  align-self: center;",
      "  position: relative;",
      "}",
      ".sv-spark-tooltip {",
      "  position: absolute;",
      "  background: #202124;",
      "  color: #fff;",
      "  padding: 6px 10px;",
      "  border-radius: 6px;",
      "  font-size: 12px;",
      "  font-weight: 500;",
      "  white-space: nowrap;",
      "  pointer-events: none;",
      "  opacity: 0;",
      "  transition: opacity 0.15s;",
      "  z-index: 10;",
      "  transform: translate(-50%, -100%);",
      "  margin-top: -8px;",
      "}",
      ".sv-spark-tooltip.sv-visible { opacity: 1; }",
      ".sv-spark-comparison {",
      "  font-size: 13px;",
      "  font-weight: 500;",
      "  margin-top: 6px;",
      "  display: flex;",
      "  align-items: center;",
      "  gap: 4px;",
      "}",
      ".sv-spark-arrow-up { color: #188038; }",
      ".sv-spark-arrow-down { color: #c5221f; }",
      ".sv-spark-arrow-neutral { color: #5f6368; }",
      ".sv-spark-comp-label { color: #80868b; }",
      ".sv-spark-dot {",
      "  cursor: pointer;",
      "  transition: r 0.12s;",
      "}"
    ].join("\n");

    element.appendChild(style);

    this._container = document.createElement("div");
    this._container.className = "sv-spark-container";
    element.appendChild(this._container);
  },

  updateAsync: function(data, element, config, queryResponse, details, done) {
    var self = this;

    if (!this._container) {
      this.create(element, config);
    }

    // -- Bail if no data --
    if (!data || data.length === 0 || !queryResponse) {
      this._container.innerHTML = '<div style="color:#999;font-size:14px;">No results</div>';
      done();
      return;
    }

    var dims = queryResponse.fields.dimension_like;
    var meas = queryResponse.fields.measure_like;

    if (meas.length === 0) {
      this._container.innerHTML = '<div style="color:#999;font-size:14px;">Need at least one measure</div>';
      done();
      return;
    }

    var measureField = meas[0];
    var measureName = measureField.name;
    var dimName = dims.length > 0 ? dims[0].name : null;

    // -- Build row objects with all the metadata we need --
    var rows = [];
    for (var i = 0; i < data.length; i++) {
      var measureCell = data[i][measureName];
      var numValue = (measureCell && measureCell.value != null) ? Number(measureCell.value) : 0;
      if (isNaN(numValue)) numValue = 0;

      var dimLabel = "";
      if (dimName && data[i][dimName]) {
        dimLabel = data[i][dimName].rendered || data[i][dimName].value || "";
      }

      rows.push({
        label: dimLabel,
        value: numValue,
        rendered: (measureCell && measureCell.rendered) ? measureCell.rendered : null,
        links: (measureCell && measureCell.links) ? measureCell.links : []
      });
    }

    // -- Sort oldest → newest for sparkline --
    if (dimName && rows.length >= 2) {
      var firstDim = data[0][dimName] ? String(data[0][dimName].value) : "";
      var lastDim = data[data.length - 1][dimName] ? String(data[data.length - 1][dimName].value) : "";
      if (firstDim > lastDim) {
        rows.reverse();
      }
    }

    var values = [];
    for (var vi = 0; vi < rows.length; vi++) {
      values.push(rows[vi].value);
    }

    // -- Calculate display value --
    var displayValue = 0;
    var calcMode = config.value_calculation || "sum";
    if (calcMode === "last") {
      displayValue = values[values.length - 1];
    } else {
      for (var j = 0; j < values.length; j++) {
        displayValue += values[j];
      }
    }

    // -- Grab drill links (use first row's links as the drill pattern) --
    var drillLinks = [];
    for (var li = 0; li < rows.length; li++) {
      if (rows[li].links && rows[li].links.length > 0) {
        drillLinks = rows[li].links;
        break;
      }
    }

    // -- Comparison: split in half --
    // For a true WoW, use 14-day filter so the split is 7 vs 7
    var compPct = null;
    if (values.length >= 2) {
      var mid = Math.floor(values.length / 2);
      var firstHalf = 0;
      var secondHalf = 0;
      for (var k = 0; k < mid; k++) firstHalf += values[k];
      for (var m = mid; m < values.length; m++) secondHalf += values[m];
      if (firstHalf !== 0) {
        compPct = ((secondHalf - firstHalf) / Math.abs(firstHalf)) * 100;
      }
    }

    // -- Format the big number --
    var formattedValue = self._formatDisplayValue(displayValue, config.value_format || "looker", rows);

    // -- Font size --
    var fontSize = config.value_size || "auto";
    if (fontSize === "auto") {
      var containerHeight = element.clientHeight || 200;
      if (containerHeight < 100) fontSize = "24";
      else if (containerHeight < 180) fontSize = "36";
      else if (containerHeight < 280) fontSize = "48";
      else fontSize = "60";
    }

    // -- Label --
    var labelText = config.value_label || measureField.label_short || measureField.label || "";

    // ============================================================
    // BUILD THE DOM (not innerHTML — we need event listeners)
    // ============================================================
    this._container.innerHTML = "";

    // -- Title label --
    if (labelText) {
      var labelDiv = document.createElement("div");
      labelDiv.className = "sv-spark-label";
      labelDiv.textContent = labelText;
      this._container.appendChild(labelDiv);
    }

    // -- Value row (number + sparkline) --
    var valueRow = document.createElement("div");
    valueRow.className = "sv-spark-value-row";

    // Big number — opens drill menu on click
    var valueDiv = document.createElement("div");
    valueDiv.className = "sv-spark-value";
    valueDiv.style.fontSize = fontSize + "px";
    valueDiv.style.color = config.value_color || "#1a1a2e";
    valueDiv.textContent = formattedValue;

    if (drillLinks.length > 0) {
      valueDiv.addEventListener("click", function(e) {
        LookerCharts.Utils.openDrillMenu({
          links: drillLinks,
          event: e
        });
      });
    }

    valueRow.appendChild(valueDiv);

    // -- Sparkline with hover tooltips + click-to-drill per point --
    var showSparkline = config.show_sparkline !== false;
    if (showSparkline && values.length >= 2) {
      var sparkWidth = Math.max(140, Math.min(240, element.clientWidth * 0.25));
      var sparkHeight = Math.max(40, parseInt(fontSize) * 1.0);

      var chartDiv = document.createElement("div");
      chartDiv.className = "sv-spark-chart";

      // Tooltip element (positioned absolutely within chartDiv)
      var tooltip = document.createElement("div");
      tooltip.className = "sv-spark-tooltip";
      chartDiv.appendChild(tooltip);

      // Build SVG
      var svgMarkup = self._buildSparklineSVG(rows, sparkWidth, sparkHeight, config);
      var tempDiv = document.createElement("div");
      tempDiv.innerHTML = svgMarkup;
      var svgEl = tempDiv.firstChild;
      chartDiv.appendChild(svgEl);

      // Wire up hover + drill on each dot
      var dots = svgEl.querySelectorAll(".sv-spark-dot");
      for (var di = 0; di < dots.length; di++) {
        (function(dot, idx) {
          dot.addEventListener("mouseenter", function() {
            var row = rows[idx];
            var tipValue = row.rendered || self._formatShorthand(row.value);
            var tipText = row.label ? (row.label + ": " + tipValue) : tipValue;
            tooltip.textContent = tipText;
            tooltip.style.left = dot.getAttribute("cx") + "px";
            tooltip.style.top = dot.getAttribute("cy") + "px";
            tooltip.classList.add("sv-visible");
            dot.setAttribute("r", "5");
            dot.setAttribute("opacity", "1");
          });

          dot.addEventListener("mouseleave", function() {
            tooltip.classList.remove("sv-visible");
            dot.setAttribute("r", "3");
            dot.setAttribute("opacity", "0");
          });

          dot.addEventListener("click", function(e) {
            var row = rows[idx];
            if (row.links && row.links.length > 0) {
              LookerCharts.Utils.openDrillMenu({
                links: row.links,
                event: e
              });
            }
          });
        })(dots[di], di);
      }

      valueRow.appendChild(chartDiv);
    }

    this._container.appendChild(valueRow);

    // -- Comparison row --
    var showComp = config.show_comparison !== false;
    if (showComp && compPct !== null) {
      var positiveIsGood = config.positive_is_good !== false;
      var isUp = compPct > 0;
      var isNeutral = Math.abs(compPct) < 0.05;
      var arrow, colorClass;

      if (isNeutral) {
        arrow = "\u25B8";
        colorClass = "sv-spark-arrow-neutral";
      } else if (isUp) {
        arrow = "\u25B2";
        colorClass = positiveIsGood ? "sv-spark-arrow-up" : "sv-spark-arrow-down";
      } else {
        arrow = "\u25BC";
        colorClass = positiveIsGood ? "sv-spark-arrow-down" : "sv-spark-arrow-up";
      }

      var compDiv = document.createElement("div");
      compDiv.className = "sv-spark-comparison";

      var compSpan = document.createElement("span");
      compSpan.className = colorClass;
      compSpan.textContent = arrow + " " + Math.abs(compPct).toFixed(1) + "%";

      var compLabelSpan = document.createElement("span");
      compLabelSpan.className = "sv-spark-comp-label";
      compLabelSpan.textContent = config.comparison_label || "vs. prior period";

      compDiv.appendChild(compSpan);
      compDiv.appendChild(compLabelSpan);
      this._container.appendChild(compDiv);
    }

    done();
  },

  // ============================================================
  // SVG BUILDER — line + invisible hover dots
  // ============================================================
  _buildSparklineSVG: function(rows, width, height, config) {
    var color = config.sparkline_color || "#4285F4";
    var strokeWidth = parseFloat(config.sparkline_weight) || 2;
    var padding = Math.max(strokeWidth + 1, 6);

    var values = [];
    for (var i = 0; i < rows.length; i++) values.push(rows[i].value);

    var min = Infinity, max = -Infinity;
    for (var a = 0; a < values.length; a++) {
      if (values[a] < min) min = values[a];
      if (values[a] > max) max = values[a];
    }
    if (max === min) max = min + 1;

    var dw = width - (padding * 2);
    var dh = height - (padding * 2);

    var coords = [];
    for (var j = 0; j < values.length; j++) {
      coords.push({
        x: padding + (j / (values.length - 1)) * dw,
        y: padding + dh - ((values[j] - min) / (max - min)) * dh
      });
    }

    var polyPoints = [];
    for (var p = 0; p < coords.length; p++) {
      polyPoints.push(coords[p].x.toFixed(1) + "," + coords[p].y.toFixed(1));
    }

    var svg = [];
    svg.push('<svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;">');
    svg.push('  <polyline fill="none" stroke="' + color + '" stroke-width="' + strokeWidth + '" stroke-linecap="round" stroke-linejoin="round" points="' + polyPoints.join(" ") + '" />');

    // Invisible dots — become visible on hover via JS
    for (var d = 0; d < coords.length; d++) {
      svg.push('  <circle class="sv-spark-dot" cx="' + coords[d].x.toFixed(1) + '" cy="' + coords[d].y.toFixed(1) + '" r="3" fill="' + color + '" opacity="0" data-idx="' + d + '" />');
    }

    svg.push('</svg>');
    return svg.join("\n");
  },

  // ============================================================
  // FORMATTING
  // ============================================================

  // Tries to match LookML formatting, falls back to shorthand
  _formatDisplayValue: function(value, formatSetting, rows) {
    if (formatSetting === "raw") return String(value);
    if (formatSetting === "number") return value.toLocaleString();
    if (formatSetting === "short") return this._formatShorthand(value);

    // "looker" mode — detect format from a sample rendered value
    if (formatSetting === "looker" && rows && rows.length > 0 && rows[0].rendered) {
      var sample = rows[0].rendered;
      var sampleVal = rows[0].value;

      if (sampleVal !== 0 && sample) {
        var prefix = "";
        var suffix = "";
        if (sample.charAt(0) === "$") prefix = "$";
        if (sample.charAt(sample.length - 1) === "%") suffix = "%";

        // Decimal places
        var decPlaces = 0;
        var dotIdx = sample.indexOf(".");
        if (dotIdx >= 0) {
          var afterDot = sample.substring(dotIdx + 1).replace(/[^0-9]/g, "");
          decPlaces = afterDot.length;
        }

        var hasCommas = sample.indexOf(",") >= 0;
        var formatted;
        if (hasCommas) {
          formatted = value.toLocaleString(undefined, {
            minimumFractionDigits: decPlaces,
            maximumFractionDigits: decPlaces
          });
        } else {
          formatted = decPlaces > 0 ? value.toFixed(decPlaces) : String(Math.round(value));
        }

        return prefix + formatted + suffix;
      }
    }

    // Default: auto shorthand
    return this._formatShorthand(value);
  },

  _formatShorthand: function(value) {
    var abs = Math.abs(value);
    if (abs >= 1e9) return (value / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
    if (abs >= 1e6) return (value / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (abs >= 1e4) return (value / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return value.toLocaleString();
  },

  _escapeHtml: function(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

});
