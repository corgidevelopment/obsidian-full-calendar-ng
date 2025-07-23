// This file creates a custom, lightweight bundle of Plotly.

// Import the Plotly core
import Plotly from 'plotly.js/lib/core';

// Import only the chart types we need
import pie from 'plotly.js/lib/pie';
import sunburst from 'plotly.js/lib/sunburst';
import scatter from 'plotly.js/lib/scatter';
import bar from 'plotly.js/lib/bar';
import heatmap from 'plotly.js/lib/heatmap';

// Register the chart types with the Plotly core
Plotly.register([pie, sunburst, scatter, bar, heatmap]);

// Export the custom Plotly object
export default Plotly;
