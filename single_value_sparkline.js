/**
 * Single Value + Sparkline Custom Visualization for Looker
 * 
 * Expects a query with:
 *   - 1 date/time dimension (for the sparkline x-axis)
 *   - 1 measure (for the value + sparkline y-axis)
 * 
 * Displays: big number (sum of all rows), sparkline trend, and WoW % change.
 * 
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
      default: "auto",
      display: "select",
      values: [
        { "Auto": "auto" },
        { "1,234": "number" },
        { "1.2K / 1.2M / 1.2B": "short" },
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
      label: "Show WoW Comparison",
      default: true,
      section: "Comparison",
      order: 1
    },
    comparison_label: {
      type: "string",
      label: "Comparison Label",
      default: "vs. prior week",
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
      "}",
      ".sv-spark-chart {",
      "  flex-shrink: 0;",
      "  align-self: center;",
      "}",
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
      ".sv-spark-comp-label { color: #80868b; }"
    ].join("\n");

    element.appendChild(style);

    this._container = document.createElement("div");
    this._container.className = "sv-spark-container";
    element.appendChild(this._container);
  },

  updateAsync: function(data, element, config, queryResponse, details, done) {
    // -- Safety check --
    if (!this._container) {
      this.create(element, config);
    }

    // -- Bail if no data --
    if (!data || data.length === 0 || !queryResponse) {
      this._container.innerHTML = '<div style="color:#999;font-size:14px;">No results</div>';
      done();
      return;
    }

    // -- Pull the dimension and measure field names --
    var dims = queryResponse.fields.dimension_like;
    var meas = queryResponse.fields.measure_like;

    if (meas.length === 0) {
      this._container.innerHTML = '<div style="color:#999;font-size:14px;">Need at least one measure</div>';
      done();
      return;
    }

    var measureName = meas[0].name;
    var dimName = dims.length > 0 ? dims[0].name : null;

    // -- Extract values in row order (assumes sorted by date asc or desc) --
    var values = [];
    for (var i = 0; i < data.length; i++) {
      var cell = data[i][measureName];
      var v = (cell && cell.value != null) ? Number(cell.value) : 0;
      if (!isNaN(v)) values.push(v);
    }

    // If sorted desc (most recent first), reverse so sparkline draws oldest→newest
    if (dimName && data.length >= 2) {
      var first = data[0][dimName] ? data[0][dimName].value : null;
      var last = data[data.length - 1][dimName] ? data[data.length - 1][dimName].value : null;
      if (first && last && String(first) > String(last)) {
        values.reverse();
      }
    }

    // -- Calculate the display value --
    var displayValue = 0;
    var calcMode = config.value_calculation || "sum";

    if (calcMode === "last") {
      // Most recent value (last element after sorting oldest→newest)
      displayValue = values[values.length - 1];
    } else {
      // Sum of all rows
      for (var j = 0; j < values.length; j++) {
        displayValue += values[j];
      }
    }

    // -- Comparison calculation --
    // How this works:
    //   - If you have 14 rows (e.g. 14 days), first 7 = prior period, last 7 = current period
    //   - If you have an even number of rows, splits evenly
    //   - If you have an odd number (e.g. 7 days), first 3 = prior, last 4 = current
    //   - For a true WoW comparison, set your date filter to 14 days so the split is clean
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
    var formattedValue = this._formatValue(displayValue, config.value_format || "auto");

    // -- Determine font size --
    var fontSize = config.value_size || "auto";
    if (fontSize === "auto") {
      var containerHeight = element.clientHeight || 200;
      if (containerHeight < 100) fontSize = "24";
      else if (containerHeight < 180) fontSize = "36";
      else if (containerHeight < 280) fontSize = "48";
      else fontSize = "60";
    }

    // -- Build the label from config or from measure label --
    var labelText = config.value_label || meas[0].label_short || meas[0].label || "";

    // -- Render --
    var html = [];

    // Label
    if (labelText) {
      html.push('<div class="sv-spark-label">' + this._escapeHtml(labelText) + '</div>');
    }

    // Value row: big number + sparkline
    html.push('<div class="sv-spark-value-row">');
    html.push('<div class="sv-spark-value" style="font-size:' + fontSize + 'px;color:' + (config.value_color || '#1a1a2e') + ';">' + formattedValue + '</div>');

    // Sparkline SVG
    var showSparkline = config.show_sparkline !== false;
    if (showSparkline && values.length >= 2) {
      var sparkWidth = Math.max(100, Math.min(180, element.clientWidth * 0.2));
      var sparkHeight = Math.max(30, parseInt(fontSize) * 0.75);
      html.push('<div class="sv-spark-chart">' + this._buildSparkline(values, sparkWidth, sparkHeight, config) + '</div>');
    }

    html.push('</div>');

    // Comparison
    var showComp = config.show_comparison !== false;
    if (showComp && compPct !== null) {
      var positiveIsGood = config.positive_is_good !== false;
      var isUp = compPct > 0;
      var isNeutral = Math.abs(compPct) < 0.05;
      var arrow, colorClass;

      if (isNeutral) {
        arrow = "▸";
        colorClass = "sv-spark-arrow-neutral";
      } else if (isUp) {
        arrow = "▲";
        colorClass = positiveIsGood ? "sv-spark-arrow-up" : "sv-spark-arrow-down";
      } else {
        arrow = "▼";
        colorClass = positiveIsGood ? "sv-spark-arrow-down" : "sv-spark-arrow-up";
      }

      var compLabel = config.comparison_label || "vs. prior period";
      html.push('<div class="sv-spark-comparison">');
      html.push('<span class="' + colorClass + '">' + arrow + ' ' + Math.abs(compPct).toFixed(1) + '%</span>');
      html.push('<span class="sv-spark-comp-label">' + this._escapeHtml(compLabel) + '</span>');
      html.push('</div>');
    }

    this._container.innerHTML = html.join("");
    done();
  },

  // -- Sparkline SVG builder --
  _buildSparkline: function(values, width, height, config) {
    var color = config.sparkline_color || "#4285F4";
    var strokeWidth = parseFloat(config.sparkline_weight) || 2;
    var padding = strokeWidth + 1;

    var min = Infinity, max = -Infinity;
    for (var i = 0; i < values.length; i++) {
      if (values[i] < min) min = values[i];
      if (values[i] > max) max = values[i];
    }

    // Avoid flat line if all values are the same
    if (max === min) { max = min + 1; }

    var drawWidth = width - (padding * 2);
    var drawHeight = height - (padding * 2);

    var points = [];
    for (var j = 0; j < values.length; j++) {
      var x = padding + (j / (values.length - 1)) * drawWidth;
      var y = padding + drawHeight - ((values[j] - min) / (max - min)) * drawHeight;
      points.push(x.toFixed(1) + "," + y.toFixed(1));
    }

    var svg = [
      '<svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" xmlns="http://www.w3.org/2000/svg">',
      '  <polyline',
      '    fill="none"',
      '    stroke="' + color + '"',
      '    stroke-width="' + strokeWidth + '"',
      '    stroke-linecap="round"',
      '    stroke-linejoin="round"',
      '    points="' + points.join(" ") + '"',
      '  />',
      '</svg>'
    ].join("\n");

    return svg;
  },

  // -- Number formatting --
  _formatValue: function(value, format) {
    if (format === "raw") return String(value);

    var abs = Math.abs(value);

    if (format === "short" || (format === "auto" && abs >= 10000)) {
      if (abs >= 1e9) return (value / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
      if (abs >= 1e6) return (value / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
      if (abs >= 1e3) return (value / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
      return value.toLocaleString();
    }

    if (format === "number" || format === "auto") {
      return value.toLocaleString();
    }

    return String(value);
  },

  // -- XSS protection --
  _escapeHtml: function(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

});
