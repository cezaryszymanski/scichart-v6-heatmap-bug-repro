import { drawExample } from "./drawExample";

const status = document.getElementById("status");
drawExample("chart", status).then(({ start, stop }) => {
    document.getElementById("start").addEventListener("click", start);
    document.getElementById("stop").addEventListener("click", stop);
});
