import * as ui from "./ui.js";
import Canvas from "./canvas.js";
import Optimizer from "./optimizer.js";
import Poppy from "poppyio/use-en.mjs";
import { dataURItoBlob } from "./util.js";

const nodes = {
	output: document.querySelector("#output"),
	original: document.querySelector("#original"),
	steps: document.querySelector("#steps"),
	raster: document.querySelector("#raster"),
	vector: document.querySelector("#vector"),
	vectorText: document.querySelector("#vector-text"),
	types: Array.from(document.querySelectorAll("#output [name=type]"))
}

let steps;

function go(original, cfg) {
	ui.lock();

	nodes.steps.innerHTML = "";
	nodes.original.innerHTML = "";
	nodes.raster.innerHTML = "";
	nodes.vector.innerHTML = "";
	nodes.vectorText.value = "";

	nodes.output.style.display = "";
	nodes.original.appendChild(original.node);

	let optimizer = new Optimizer(original, cfg);
	steps = 0;

	let cfg2 = Object.assign({}, cfg, {width:cfg.scale*cfg.width, height:cfg.scale*cfg.height});
	let result = Canvas.empty(cfg2, false);
	result.ctx.scale(cfg.scale, cfg.scale);
	nodes.raster.appendChild(result.node);

	let svg = Canvas.empty(cfg, true);
	svg.setAttribute("width", cfg2.width);
	svg.setAttribute("height", cfg2.height);
	nodes.vector.appendChild(svg);

	let serializer = new XMLSerializer();

	optimizer.onStep = (step) => {
		if (step) {
			result.drawStep(step);
			svg.appendChild(step.toSVG());
			let percent = (100*(1-step.distance)).toFixed(2);
			nodes.vectorText.value = serializer.serializeToString(svg);
			nodes.steps.innerHTML = `(${++steps} of ${cfg.steps}, ${percent}% similar)`;
		}
	}
	optimizer.start();

	document.documentElement.scrollTop = document.documentElement.scrollHeight;
}

var url;

var basePoppy = Poppy.with({
	clientName: "primitive.js"
});

function onPick(e) {
	basePoppy.with({ url: e.target.getAttribute('data-poppy') }).accept("image/*").then(offered => {
		if (!offered) return;
		window.offered = offered;
		if (!offered) return;
		if (url) URL.revokeObjectURL(url);

		var img = new Image;
		img.crossOrigin = true;
		if (offered.data.location) {
			url = img.src = offered.data.location;
		} else if (offered.data.contents) {
			url = img.src = URL.createObjectURL(offered.data.contents);
		}

		img.onload = () => {
			var maxDimension = Math.max(img.width, img.height);
			if (maxDimension > 200) {
				var fraction = 1;
				fraction = 200 / maxDimension;
				img.width = fraction * img.width;
				img.height = fraction * img.height;
				document.getElementById('thumbnail').innerHTML = '';
				document.getElementById('thumbnail').appendChild(img);
			}
		};
	}).catch(error => {
		console.error(error);
		alert('Error: ' + error);
	});
}

function onSubmit(e) {
	e.preventDefault();
	let cfg = ui.getConfig();
	Canvas.original(url, cfg).then(original => go(original, cfg));
}

function onSave(e) {
	let canvas = document.querySelector('#raster canvas');
	basePoppy.with({ url: e.target.getAttribute('data-poppy') }).offer('image/png', () => {
		if (typeof canvas.toBlob === 'function') {
			return new Promise(resolve => {
				canvas.toBlob(resolve, 'image/png');
			}).then(blob => {
				return Promise.resolve({
					contents: blob
				});
			});
		} else {
			return {
				contents: dataURItoBlob(canvas.toDataURL('image/png'))
			};
		}
	}).then(response => {
		if (!response || !response.data) return;
		let accepted = response.data;
		let savedTo = document.getElementById("savedTo");
		let link = document.getElementById("savedToLink");
		if (accepted && typeof accepted.link === "string") {
			savedTo.style.display = "inline";
			if (accepted.link.startsWith("http://") || accepted.link.startsWith("https://")) {
				link.textContent = accepted.link;
				link.href = accepted.link;
			} else {
				link.removeAttribute("href");
				link.textContent = "Possibly unsafe URL " + accepted.link;
			}
		} else {
			savedTo.style.display = "none";
		}
	}).catch(error => {
		console.error(error);
		alert('Error: ' + error);
	});
}

function $$(sel) {
	return Array.prototype.slice.call(document.querySelectorAll(sel));
}

function init() {
	nodes.output.style.display = "none";
	nodes.types.forEach(input => input.addEventListener("click", syncType));
	ui.init();
	syncType();
	document.querySelector("form").addEventListener("submit", onSubmit);
	$$(".pick").forEach(button => button.addEventListener("click", onPick));
	$$(".save").forEach(button => button.addEventListener("click", onSave));
}

function syncType() {
	nodes.output.className = "";
	nodes.types.forEach(input => {
		if (input.checked) { nodes.output.classList.add(input.value); }
	});
}

init();
