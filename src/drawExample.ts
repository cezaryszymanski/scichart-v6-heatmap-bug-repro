import {
    HeatmapColorMap,
    NumericAxis,
    SciChartSurface,
    UniformHeatmapDataSeries,
    UniformHeatmapRenderableSeries,
} from "scichart";
import { appTheme } from "./theme";

// Repro for GPU memory growth when a heatmap's zValues change size.
// Each cycle adds a heatmap and appends one row per frame with setZValues (so the
// texture size changes every frame), then removes the series. Watch GPU memory
// (Chrome Task Manager "GPU memory", or Shmem in /proc/meminfo on Linux iGPUs).
//
// URL params:
//   ?mode=grow   (default) height grows by one row per frame -> memory keeps growing on v6
//   ?mode=fixed  same size every frame (control)             -> memory stays flat
//   &width=2000&rows=400  heatmap width and rows per cycle
const params = new URLSearchParams(location.search);
const MODE = params.get("mode") === "fixed" ? "fixed" : "grow";
const WIDTH = Number(params.get("width") ?? 2000);
const ROWS = Number(params.get("rows") ?? 400);

// Shmem in MB from the dev server (Linux only), undefined elsewhere
let shmemMb: number | undefined;
const pollShmem = async () => {
    try {
        const res = await fetch("/shmem");
        shmemMb = res.ok ? Number(await res.text()) : undefined;
    } catch {
        shmemMb = undefined;
    }
};
setInterval(pollShmem, 500);
pollShmem();

const makeRow = (seed: number) => {
    const row = new Array<number>(WIDTH);
    for (let x = 0; x < WIDTH; x++) {
        row[x] = (1 + Math.sin(x * 0.02 + seed * 0.1)) * 100;
    }
    return row;
};

export const drawExample = async (rootElement: string | HTMLDivElement, status: HTMLElement) => {
    const { sciChartSurface, wasmContext } = await SciChartSurface.create(rootElement, {
        theme: appTheme.SciChartJsTheme,
    });
    sciChartSurface.xAxes.add(new NumericAxis(wasmContext));
    sciChartSurface.yAxes.add(new NumericAxis(wasmContext));

    let running = false;
    let cycle = 0;
    let row = 0;
    let zValues: number[][] = [];
    let dataSeries: UniformHeatmapDataSeries | undefined;

    const startCycle = () => {
        cycle++;
        row = 0;
        zValues = MODE === "fixed" ? Array.from({ length: ROWS }, (_, i) => makeRow(i)) : [makeRow(0)];
        dataSeries = new UniformHeatmapDataSeries(wasmContext, {
            xStart: 0,
            xStep: 1,
            yStart: 0,
            yStep: 1,
            zValues,
        });
        sciChartSurface.renderableSeries.add(
            new UniformHeatmapRenderableSeries(wasmContext, {
                dataSeries,
                colorMap: new HeatmapColorMap({
                    minimum: 0,
                    maximum: 200,
                    gradientStops: [
                        { offset: 0, color: appTheme.DarkIndigo },
                        { offset: 0.5, color: appTheme.VividGreen },
                        { offset: 1, color: appTheme.VividPink },
                    ],
                }),
            })
        );
    };

    const endCycle = () => {
        // Deletes the renderable series and its data series
        sciChartSurface.renderableSeries.clear(true);
        dataSeries = undefined;
    };

    const tick = () => {
        if (!running) return;
        if (!dataSeries) startCycle();

        row++;
        if (MODE === "grow") {
            zValues.push(makeRow(row));
        } else {
            zValues[row % ROWS] = makeRow(row);
        }
        dataSeries.setZValues(zValues);

        const engineHeapMb = Math.round((wasmContext as any).HEAPU8.buffer.byteLength / 1024 / 1024);
        status.textContent =
            `mode=${MODE} cycle=${cycle} row=${row}/${ROWS} size=${WIDTH}x${dataSeries.arrayHeight} ` +
            `engine heap=${engineHeapMb} MB` +
            (shmemMb !== undefined ? ` shmem=${shmemMb} MB` : "");

        if (row >= ROWS) {
            endCycle();
            console.log(`cycle ${cycle} done: engine heap=${engineHeapMb} MB shmem=${shmemMb ?? "n/a"} MB`);
        }
        requestAnimationFrame(tick);
    };

    status.textContent = `mode=${MODE} size=${WIDTH}x${ROWS} - press Start`;

    return {
        sciChartSurface,
        start: () => {
            if (running) return;
            running = true;
            requestAnimationFrame(tick);
        },
        stop: () => (running = false),
    };
};
