import * as ui from "./ui.js";
import Canvas from "./canvas.js";
import Optimizer from "./optimizer.js";
import { dataURItoBlob } from "./util.js";

import "poppyio/install-en.mjs";
import { PoppyClient } from "poppyio/poppy-client.mjs";

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
async function onPick(e) {
	try {
		let pick = await new PoppyClient()
			.createRequest({
				prompt: 'Select an image to primitivize',
				serviceUrl: e.target.dataset.poppy
			})
			.connect({
				accepting: ['content-blob', 'content-download'],
				having: {
					multiple: false,
					contentType: 'image/*'
				}
			});

		if (!pick.offer[0]) return;

		let offer = pick.offer[0];
		let img = new Image;
		img.crossOrigin = true;
		if (offer.blob instanceof Blob) {
			if (url) URL.revokeObjectURL(url);
			url = img.src = URL.createObjectURL(offer.blob);
		} else if (typeof offer.download === 'string') {
			if (url) URL.revokeObjectURL(url);
			url = img.src = offer.download;
		} else {
			throw new Error('Did not recieve a valid image offer');
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
		img.onerror = () => {
			alert('unable to load image');
		}
	} catch (e) {
		console.error(e);
		alert('Error: ' + e.message);
	}
}

function onSubmit(e) {
	e.preventDefault();
	let cfg = ui.getConfig();
	Canvas.original(url, cfg).then(original => go(original, cfg));
}

function onSave(e) {
	let canvas = document.querySelector('#raster canvas');
	try {
		new PoppyClient()
		.createRequest({
			prompt: 'Save primitivized image',
			serviceUrl: e.target.dataset.poppy
		})
		.connect({
			offering: 'content-blob',
			having: {
				contentType: 'image/png'
			},
			async deliver(acceptor) {
				let blob;
				if (typeof canvas.toBlob === 'function') {
					blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
				} else {
					blob = dataURItoBlob(canvas.toDataURL('image/png'));
				}
				let result = await acceptor.postOffer({
					blob
				});
				let accepted = result.data[0];
				if (!accepted) return;
				let savedTo = document.getElementById("savedTo");
				let link = document.getElementById("savedToLink");
				if (typeof accepted.link === "string") {
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
			}
		});
	} catch (e) {
		alert('Error: ' + e.message);
		console.error(e);
	}
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
