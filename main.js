const { Plugin, ItemView } = require('obsidian');

class FinanceDashboardView extends ItemView {
  constructor(leaf, html) {
    super(leaf);
    this.html = html;
  }

  getViewType() {
    return 'finance-dashboard';
  }

  getDisplayText() {
    return 'Finance Dashboard';
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.createEl('iframe', {
      attr: {
        srcdoc: this.html,
        style: 'width: 100%; height: 100%; border: none;'
      }
    });
  }

  async onClose() {}
}

module.exports = class FinanceTrackerPlugin extends Plugin {
  async onload() {
    this.addRibbonIcon('dollar-sign', 'Finance Tracker', async () => {
      await this.openDashboard();
    });

    this.addCommand({
      id: 'open-finance-dashboard',
      name: 'Open Finance Dashboard',
      callback: async () => await this.openDashboard()
    });

    this.registerView(
      'finance-dashboard',
      (leaf) => new FinanceDashboardView(leaf, this.dashboardHTML)
    );
  }

  async openDashboard() {
    const files = this.app.vault.getMarkdownFiles();
    const expenseRegex = /^(\d{2}-\d{2}-\d{4}) \| (.*?) \| (.*?) \| (\d+(?:\.\d+)?)/gm;
    const allData = [];

    for (const file of files) {
      const content = await this.app.vault.read(file);
      let match;
      while ((match = expenseRegex.exec(content)) !== null) {
        let rawDate = match[1];
        let [dd, mm, yyyy] = rawDate.split('-');
        let date = `${yyyy}-${mm}-${dd}`; // Normalized to YYYY-MM-DD

        const allowedCategories = [
          "Food", "Traveling", "Subscriptions", "Shopping",
          "Rent/Bills", "Personal Care", "Entertainment", "Miscellaneous"
        ];

        let category = match[2].trim();
        if (!allowedCategories.includes(category)) {
          category = "Miscellaneous";
        }

        const desc = match[3];
        const amount = parseFloat(match[4]);

        allData.push({ date, category, desc, amount });
      }
    }

    const html = this.buildDashboard(allData);
    this.dashboardHTML = html;
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({
      type: 'finance-dashboard',
      active: true
    });
  }

  buildDashboard(data) {
    const style = `
      <style>
        body {
          background-color: transparent;
          color: var(--text-normal);
          font-family: system-ui;
        }
        h1, h2, h3 {
          color: #ff6f61 !important;
        }
        /* Scrollbar styling for WebKit (Chrome, Edge, Safari) */
        ::-webkit-scrollbar {
          width: 8px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background-color: #555;
          border-radius: 6px;
        }

        /* Optional: Hide scrollbar in Firefox unless scrolling */
        body {
          scrollbar-width: thin;
          scrollbar-color: #555 transparent;
        }
      </style>
    `;

    const jsonData = JSON.stringify(data);

    const chartScript = `
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <script>
        const rawData = ${jsonData};

        function filterData(data, filter) {
          const todayObj = new Date();
          const today = todayObj.getFullYear() + '-' +
                        String(todayObj.getMonth() + 1).padStart(2, '0') + '-' +
                        String(todayObj.getDate()).padStart(2, '0');
          const month = today.slice(0, 7);
          if (filter === "today") {
            return data.filter(d => d.date === today);
          } else if (filter === "month") {
            return data.filter(d => d.date.startsWith(month));
          }
          return data;
        }

        function renderCharts(filteredData) {
          document.getElementById("totalDisplay").innerText =
            "Total Spending: ₹" + filteredData.reduce((sum, entry) => sum + entry.amount, 0).toFixed(2);
          const byCategory = {};
          const byDate = {};

          for (const item of filteredData) {
            // Pie chart
            byCategory[item.category] = (byCategory[item.category] || 0) + item.amount;

            // Line chart (per category per date)
            if (!byDate[item.date]) byDate[item.date] = {};
            byDate[item.date][item.category] = (byDate[item.date][item.category] || 0) + item.amount;
          }

          const catLabels = Object.keys(byCategory);
          const catData = Object.values(byCategory);

          const sortedDates = Object.keys(byDate).sort((a, b) => new Date(a) - new Date(b));

          const categories = [
            "Food", "Traveling", "Subscriptions", "Shopping",
            "Rent/Bills", "Personal Care", "Entertainment", "Miscellaneous"
          ];

          const colors = ["#4caf50","#2196f3","#ff9800","#e91e63","#9c27b0","#00bcd4","#cddc39","#9e9e9e"];

          const datasets = categories.map((cat, index) => {
            const data = sortedDates.map(date => byDate[date]?.[cat] || 0);
            return {
              label: cat,
              data,
              borderColor: colors[index],
              fill: false
            };
          });

          // Add total line
          const totalLine = {
            label: "Total",
            data: sortedDates.map(date => {
              const dailyData = byDate[date] || {};
              return Object.values(dailyData).reduce((a, b) => a + b, 0);
            }),
            borderColor: "#ffffff",
            borderWidth: 3,
            fill: false,
            tension: 0.2,
          };

          datasets.push(totalLine);

          document.getElementById("categoryChart").remove();
          document.getElementById("dateChart").remove();

          const catCanvas = document.createElement("canvas");
          catCanvas.id = "categoryChart";
          catCanvas.style = "width: 100%; height: auto;";
          document.getElementById("catContainer").appendChild(catCanvas);

          const dateCanvas = document.createElement("canvas");
          dateCanvas.id = "dateChart";
          document.getElementById("dateContainer").appendChild(dateCanvas);

          new Chart(catCanvas, {
            type: "pie",
            data: {
              labels: catLabels,
              datasets: [{
                data: catData,
                backgroundColor: colors
              }]
            },
            options: {
              plugins: {
                legend: { labels: { color: "white" } }
              }
            }
          });

          const filter = document.getElementById("filter").value;

        if (filter === "today") {
          // Show bar chart for today's categories
          new Chart(dateCanvas, {
            type: "bar",
            data: {
              labels: catLabels,
              datasets: [{
                data: catData,
                backgroundColor: ["#4caf50","#2196f3","#ff9800","#e91e63","#9c27b0","#00bcd4","#cddc39","#9e9e9e"]
              }]
            },
            options: {
              plugins: {
                legend: {
                  display: false
                }
              },
              scales: {
                x: { ticks: { color: "white" } },
                y: { ticks: { color: "white" } }
              }
            }
          });
        } else {
          // Show line chart with all categories + total
          new Chart(dateCanvas, {
            type: "line",
            data: {
              labels: sortedDates,
              datasets
            },
            options: {
              scales: {
                x: { ticks: { color: "white" } },
                y: { ticks: { color: "white" } }
              },
              plugins: {
                legend: { labels: { color: "white" } }
              }
            }
          });
        }
      }

        document.addEventListener("DOMContentLoaded", () => {
          document.getElementById("filter").addEventListener("change", (e) => {
            const filtered = filterData(rawData, e.target.value);
            renderCharts(filtered);
          });
          const initialFilter = document.getElementById("filter").value;
          const filtered = filterData(rawData, initialFilter);
          renderCharts(filtered);
        });
      </script>
    `;

    const html = `
      <html>
        <head>
          ${style}
        </head>
        <body>
          <h2>Finance Dashboard</h2>
          <select id="filter" style="margin-bottom: 1em; padding: 0.5em 1em; font-size: 1em; background-color: #1e1e1e; color: white; border: 1px solid #444; border-radius: 6px; appearance: none; outline: none;">
            <option value="today" selected>Today</option>
            <option value="month">This Month</option>
            <option value="all">All Time</option>
          </select>
          <div id="totalDisplay" style="margin-bottom: 1em; font-size: 1.1em; color: #fff;"></div>
          <div id="catContainer" style="width: 100%; max-width: 400px; margin: auto;">
            <canvas id="categoryChart" style="width: 100%; height: auto;"></canvas>
          </div>
          <div id="dateContainer" style="margin-top: 2em;">
            <canvas id="dateChart"></canvas>
          </div>
          ${chartScript}
        </body>
      </html>
    `;

    return html;
  }
};
