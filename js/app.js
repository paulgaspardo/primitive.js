(function () {
	'use strict';

	const SVGNS = "http://www.w3.org/2000/svg";

	function clamp(x, min, max) {
		return Math.max(min, Math.min(max, x));
	}

	function clampColor(x) {
		return clamp(x, 0, 255);
	}

	function distanceToDifference(distance, pixels) {
		return Math.pow(distance*255, 2) * (3 * pixels);
	}

	function differenceToDistance(difference, pixels) {
		return Math.sqrt(difference / (3 * pixels))/255;
	}

	function difference(data, dataOther) {
		let sum = 0, diff;
		for (let i=0;i<data.data.length;i++) {
			if (i % 4 == 3) { continue; }
			diff = dataOther.data[i]-data.data[i];
			sum = sum + diff*diff;
		}

		return sum;
	}

	function computeColor(offset, imageData, alpha) {
		let color = [0, 0, 0];
		let {shape, current, target} = imageData;
		let shapeData = shape.data;
		let currentData = current.data;
		let targetData = target.data;

		let si, sx, sy, fi, fx, fy; /* shape-index, shape-x, shape-y, full-index, full-x, full-y */
		let sw = shape.width;
		let sh = shape.height;
		let fw = current.width;
		let fh = current.height;
		let count = 0;

		for (sy=0; sy<sh; sy++) {
			fy = sy + offset.top;
			if (fy < 0 || fy >= fh) { continue; } /* outside of the large canvas (vertically) */

			for (sx=0; sx<sw; sx++) {
				fx = offset.left + sx;
				if (fx < 0 || fx >= fw) { continue; } /* outside of the large canvas (horizontally) */

				si = 4*(sx + sy*sw); /* shape (local) index */
				if (shapeData[si+3] == 0) { continue; } /* only where drawn */

				fi = 4*(fx + fy*fw); /* full (global) index */
				color[0] += (targetData[fi] - currentData[fi]) / alpha + currentData[fi];
				color[1] += (targetData[fi+1] - currentData[fi+1]) / alpha + currentData[fi+1];
				color[2] += (targetData[fi+2] - currentData[fi+2]) / alpha + currentData[fi+2];

				count++;
			}
		}

		return color.map(x => ~~(x/count)).map(clampColor);
	}

	function computeDifferenceChange(offset, imageData, color) {
		let {shape, current, target} = imageData;
		let shapeData = shape.data;
		let currentData = current.data;
		let targetData = target.data;

		let a, b, d1r, d1g, d1b, d2r, d2b, d2g;
		let si, sx, sy, fi, fx, fy; /* shape-index, shape-x, shape-y, full-index */
		let sw = shape.width;
		let sh = shape.height;
		let fw = current.width;
		let fh = current.height;

		var sum = 0; /* V8 opt bailout with let */

		for (sy=0; sy<sh; sy++) {
			fy = sy + offset.top;
			if (fy < 0 || fy >= fh) { continue; } /* outside of the large canvas (vertically) */

			for (sx=0; sx<sw; sx++) {
				fx = offset.left + sx;
				if (fx < 0 || fx >= fw) { continue; } /* outside of the large canvas (horizontally) */

				si = 4*(sx + sy*sw); /* shape (local) index */
				a = shapeData[si+3];
				if (a == 0) { continue; } /* only where drawn */

				fi = 4*(fx + fy*fw); /* full (global) index */

				a = a/255;
				b = 1-a;
				d1r = targetData[fi]-currentData[fi];
				d1g = targetData[fi+1]-currentData[fi+1];
				d1b = targetData[fi+2]-currentData[fi+2];

				d2r = targetData[fi] - (color[0]*a + currentData[fi]*b);
				d2g = targetData[fi+1] - (color[1]*a + currentData[fi+1]*b);
				d2b = targetData[fi+2] - (color[2]*a + currentData[fi+2]*b);

				sum -= d1r*d1r + d1g*d1g + d1b*d1b;
				sum += d2r*d2r + d2g*d2g + d2b*d2b;
			}
		}

		return sum;
	}

	function computeColorAndDifferenceChange(offset, imageData, alpha) {
		let rgb = computeColor(offset, imageData, alpha);
		let differenceChange = computeDifferenceChange(offset, imageData, rgb);

		let color = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

		return {color, differenceChange};
	}

	// https://stackoverflow.com/questions/12168909/blob-from-dataurl
	function dataURItoBlob(dataURI) {
		// convert base64 to raw binary data held in a string
		// doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
		var byteString = atob(dataURI.split(',')[1]);
	  
		// separate out the mime component
		var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
	  
		// write the bytes of the string to an ArrayBuffer
		var ab = new ArrayBuffer(byteString.length);
	  
		// create a view into the buffer
		var ia = new Uint8Array(ab);
	  
		// set the bytes of the buffer to the correct values
		for (var i = 0; i < byteString.length; i++) {
			ia[i] = byteString.charCodeAt(i);
		}
	  
		// write the ArrayBuffer to a blob, and you're done
		var blob = new Blob([ab], {type: mimeString});
		return blob;
	}

	function getScale(width, height, limit) {
		return Math.max(width / limit, height / limit, 1);
	}

	/* FIXME move to util */
	function getFill(canvas) {
		let data = canvas.getImageData();
		let w = data.width;
		let h = data.height;
		let d = data.data;
		let rgb = [0, 0, 0];
		let count = 0;
		let i;

		for (let x=0; x<w; x++) {
			for (let y=0; y<h; y++) {
				if (x > 0 && y > 0 && x < w-1 && y < h-1) { continue; }
				count++;
				i = 4*(x + y*w);
				rgb[0] += d[i];
				rgb[1] += d[i+1];
				rgb[2] += d[i+2];
			}
		}

		rgb = rgb.map(x => ~~(x/count)).map(clampColor);
		return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
	}

	function svgRect(w, h) {
		let node = document.createElementNS(SVGNS, "rect");
		node.setAttribute("x", 0);
		node.setAttribute("y", 0);
		node.setAttribute("width", w);
		node.setAttribute("height", h);

		return node;
	}

	/* Canvas: a wrapper around a <canvas> element */
	class Canvas {
		static empty(cfg, svg) {
			if (svg) {
				let node = document.createElementNS(SVGNS, "svg");
				node.setAttribute("viewBox", `0 0 ${cfg.width} ${cfg.height}`);
				node.setAttribute("clip-path", "url(#clip)");

				let defs = document.createElementNS(SVGNS, "defs");
				node.appendChild(defs);

				let cp = document.createElementNS(SVGNS, "clipPath");
				defs.appendChild(cp);
				cp.setAttribute("id", "clip");
				cp.setAttribute("clipPathUnits", "objectBoundingBox");
				
				let rect = svgRect(cfg.width, cfg.height);
				cp.appendChild(rect);

				rect = svgRect(cfg.width, cfg.height);
				rect.setAttribute("fill", cfg.fill);
				node.appendChild(rect);

				return node;
			} else {
				return new this(cfg.width, cfg.height).fill(cfg.fill);
			}
		}

		static original(url, cfg) {
			if (url == "test") {
				return Promise.resolve(this.test(cfg));
			}

			return new Promise(resolve => {
				let img = new Image();
				img.crossOrigin = "anonymous";
				img.src = url;
				img.onload = e => {
					let w = img.naturalWidth;
					let h = img.naturalHeight;

					let computeScale = getScale(w, h, cfg.computeSize);
					cfg.width = w / computeScale;
					cfg.height = h / computeScale;

					let viewScale = getScale(w, h, cfg.viewSize);

					cfg.scale = computeScale / viewScale;

					let canvas = this.empty(cfg);
					canvas.ctx.drawImage(img, 0, 0, cfg.width, cfg.height);

					if (cfg.fill == "auto") { cfg.fill = getFill(canvas); }

					resolve(canvas);
				};
			});
		}

		static test(cfg) {
			cfg.width = cfg.computeSize;
			cfg.height = cfg.computeSize;
			cfg.scale = 1;
			let [w, h] = [cfg.width, cfg.height];

			let canvas = new this(w, h);
			canvas.fill("#fff");
			let ctx = canvas.ctx;

			ctx.fillStyle = "#f00";
			ctx.beginPath();
			ctx.arc(w/4, h/2, w/7, 0, 2*Math.PI, true);
			ctx.fill();

			ctx.fillStyle = "#0f0";
			ctx.beginPath();
			ctx.arc(w/2, h/2, w/7, 0, 2*Math.PI, true);
			ctx.fill();

			ctx.fillStyle = "#00f";
			ctx.beginPath();
			ctx.arc(w*3/4, h/2, w/7, 0, 2*Math.PI, true);
			ctx.fill();

			if (cfg.fill == "auto") { cfg.fill = getFill(canvas); }

			return canvas;
		}

		constructor(width, height) {
			this.node = document.createElement("canvas");
			this.node.width = width;
			this.node.height = height;
			this.ctx = this.node.getContext("2d");
			this._imageData = null;
		}

		clone() {
			let otherCanvas = new this.constructor(this.node.width, this.node.height);
			otherCanvas.ctx.drawImage(this.node, 0, 0);
			return otherCanvas;
		}

		fill(color) {
			this.ctx.fillStyle = color;
			this.ctx.fillRect(0, 0, this.node.width, this.node.height);
			return this;
		}

		getImageData() {
			if (!this._imageData) {
				this._imageData = this.ctx.getImageData(0, 0, this.node.width, this.node.height);
			}
			return this._imageData;
		}

		difference(otherCanvas) {
			let data = this.getImageData();
			let dataOther = otherCanvas.getImageData();

			return difference(data, dataOther);
		}

		distance(otherCanvas) {
			let difference$$1 = this.difference(otherCanvas);
			return differenceToDistance(difference$$1, this.node.width*this.node.height);
		}

		drawStep(step) {
			this.ctx.globalAlpha = step.alpha;
			this.ctx.fillStyle = step.color;
			step.shape.render(this.ctx);
			return this;
		}
	}

	/* Shape: a geometric primitive with a bbox */
	class Shape {
		static randomPoint(width, height) {
			return [~~(Math.random()*width), ~~(Math.random()*height)];
		}

		static create(cfg) {
			let ctors = cfg.shapeTypes;
			let index = Math.floor(Math.random() * ctors.length);
			let ctor = ctors[index];
			return new ctor(cfg.width, cfg.height);
		}

		constructor(w, h) {
			this.bbox = {};
		}

		mutate(cfg) { return this; }

		toSVG() {}

		/* get a new smaller canvas with this shape */
		rasterize(alpha) { 
			let canvas = new Canvas(this.bbox.width, this.bbox.height);
			let ctx = canvas.ctx;
			ctx.fillStyle = "#000";
			ctx.globalAlpha = alpha;
			ctx.translate(-this.bbox.left, -this.bbox.top);
			this.render(ctx);
			return canvas;
		}

		render(ctx) {}
	}

	class Polygon extends Shape {
		constructor(w, h, count) {
			super(w, h);

			this.points = this._createPoints(w, h, count);
			this.computeBbox();
		}

		render(ctx) {
			ctx.beginPath();
			this.points.forEach(([x, y], index) => {
				if (index) {
					ctx.lineTo(x, y);
				} else {
					ctx.moveTo(x, y);
				}
			});
			ctx.closePath();
			ctx.fill();
		}

		toSVG() {
			let path = document.createElementNS(SVGNS, "path");
			let d = this.points.map((point, index) => {
				let cmd = (index ? "L" : "M");
				return `${cmd}${point.join(",")}`;
			}).join("");
			path.setAttribute("d", `${d}Z`);
			return path;
		}

		mutate(cfg) {
			let clone = new this.constructor(0, 0);
			clone.points = this.points.map(point => point.slice());

			let index = Math.floor(Math.random() * this.points.length);
			let point = clone.points[index];

			let angle = Math.random() * 2 * Math.PI;
			let radius = Math.random() * 20;
			point[0] += ~~(radius * Math.cos(angle));
			point[1] += ~~(radius * Math.sin(angle));

			return clone.computeBbox();
		}

		computeBbox() {
			let min = [
				this.points.reduce((v, p) => Math.min(v, p[0]), Infinity),
				this.points.reduce((v, p) => Math.min(v, p[1]), Infinity)
			];
			let max = [
				this.points.reduce((v, p) => Math.max(v, p[0]), -Infinity),
				this.points.reduce((v, p) => Math.max(v, p[1]), -Infinity)
			];

			this.bbox = {
				left: min[0],
				top: min[1],
				width: (max[0]-min[0]) || 1, /* fallback for deformed shapes */
				height: (max[1]-min[1]) || 1
			};

			return this;
		}

		_createPoints(w, h, count) {
			let first = Shape.randomPoint(w, h);
			let points = [first];

			for (let i=1;i<count;i++) {
				let angle = Math.random() * 2 * Math.PI;
				let radius = Math.random() * 20;
				points.push([
					first[0] + ~~(radius * Math.cos(angle)),
					first[1] + ~~(radius * Math.sin(angle))
				]);
			}
			return points;
		}
	}

	class Triangle extends Polygon {
		constructor(w, h) {
			super(w, h, 3);
		}
	}

	class Rectangle extends Polygon {
		constructor(w, h) {
			super(w, h, 4);
		}

		mutate(cfg) {
			let clone = new this.constructor(0, 0);
			clone.points = this.points.map(point => point.slice());

			let amount = ~~((Math.random()-0.5) * 20);

			switch (Math.floor(Math.random()*4)) {
				case 0: /* left */
					clone.points[0][0] += amount;
					clone.points[3][0] += amount;
				break;
				case 1: /* top */
					clone.points[0][1] += amount;
					clone.points[1][1] += amount;
				break;
				case 2: /* right */
					clone.points[1][0] += amount;
					clone.points[2][0] += amount;
				break;
				case 3: /* bottom */
					clone.points[2][1] += amount;
					clone.points[3][1] += amount;
				break;
			}

			return clone.computeBbox();
		}

		_createPoints(w, h, count) {
			let p1 = Shape.randomPoint(w, h);
			let p2 = Shape.randomPoint(w, h);

			let left = Math.min(p1[0], p2[0]);
			let right = Math.max(p1[0], p2[0]);
			let top = Math.min(p1[1], p2[1]);
			let bottom = Math.max(p1[1], p2[1]);

			return [
				[left, top],
				[right, top],
				[right, bottom],
				[left, bottom]
			];
		}
	}

	class Ellipse extends Shape {
		constructor(w, h) {
			super(w, h);

			this.center = Shape.randomPoint(w, h);
			this.rx = 1 + ~~(Math.random() * 20);
			this.ry = 1 + ~~(Math.random() * 20);

			this.computeBbox();
		}

		render(ctx) {
			ctx.beginPath();
			ctx.ellipse(this.center[0], this.center[1], this.rx, this.ry, 0, 0, 2*Math.PI, false);
			ctx.fill();
		}

		toSVG() {
			let node = document.createElementNS(SVGNS, "ellipse");
			node.setAttribute("cx", this.center[0]);
			node.setAttribute("cy", this.center[1]);
			node.setAttribute("rx", this.rx);
			node.setAttribute("ry", this.ry);
			return node;
		}

		mutate(cfg) {
			let clone = new this.constructor(0, 0);
			clone.center = this.center.slice();
			clone.rx = this.rx;
			clone.ry = this.ry;

			switch (Math.floor(Math.random()*3)) {
				case 0:
					let angle = Math.random() * 2 * Math.PI;
					let radius = Math.random() * 20;
					clone.center[0] += ~~(radius * Math.cos(angle));
					clone.center[1] += ~~(radius * Math.sin(angle));
				break;

				case 1:
					clone.rx += (Math.random()-0.5) * 20;
					clone.rx = Math.max(1, ~~clone.rx);
				break;

				case 2:
					clone.ry += (Math.random()-0.5) * 20;
					clone.ry = Math.max(1, ~~clone.ry);
				break;
			}

			return clone.computeBbox();
		}

		computeBbox() {
			this.bbox = {
				left: this.center[0] - this.rx,
				top: this.center[1] - this.ry,
				width: 2*this.rx,
				height: 2*this.ry
			};
			return this;
		}
	}

	class Smiley extends Shape {
		constructor(w, h) {
			super(w, h);
			this.center = Shape.randomPoint(w, h);
			this.text = "☺";
			this.fontSize = 16;
			this.computeBbox();
		}

		computeBbox() {
			let tmp = new Canvas(1, 1);
			tmp.ctx.font = `${this.fontSize}px sans-serif`;
			let w = ~~(tmp.ctx.measureText(this.text).width);

			this.bbox = {
				left: ~~(this.center[0] - w/2),
				top: ~~(this.center[1] - this.fontSize/2),
				width: w,
				height: this.fontSize
			};
			return this;
		}

		render(ctx) {
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.font = `${this.fontSize}px sans-serif`;
			ctx.fillText(this.text, this.center[0], this.center[1]);
		}

		mutate(cfg) {
			let clone = new this.constructor(0, 0);
			clone.center = this.center.slice();
			clone.fontSize = this.fontSize;

			switch (Math.floor(Math.random()*2)) {
				case 0:
					let angle = Math.random() * 2 * Math.PI;
					let radius = Math.random() * 20;
					clone.center[0] += ~~(radius * Math.cos(angle));
					clone.center[1] += ~~(radius * Math.sin(angle));
				break;

				case 1:
					clone.fontSize += (Math.random() > 0.5 ? 1 : -1);
					clone.fontSize = Math.max(10, clone.fontSize);
				break;
			}

			return clone.computeBbox();
		}

		toSVG() {
			let text = document.createElementNS(SVGNS, "text");
			text.appendChild(document.createTextNode(this.text));

			text.setAttribute("text-anchor", "middle");
			text.setAttribute("dominant-baseline", "central");
			text.setAttribute("font-size", this.fontSize);
			text.setAttribute("font-family", "sans-serif");
			text.setAttribute("x", this.center[0]);
			text.setAttribute("y", this.center[1]);

			return text;
		}
	}

	const numberFields = ["computeSize", "viewSize", "steps", "shapes", "alpha", "mutations"];
	const boolFields = ["mutateAlpha"];
	const fillField = "fill";
	const shapeField = "shapeType";
	const shapeMap = {
		"triangle": Triangle,
		"rectangle": Rectangle,
		"ellipse": Ellipse,
		"smiley": Smiley
	};

	function fixRange(range) {
		function sync() {
			let value = range.value;
			range.parentNode.querySelector(".value").innerHTML = value;
		}

		range.oninput = sync;
		sync();
	}

	function init() {
		let ranges = document.querySelectorAll("[type=range]");
		Array.from(ranges).forEach(fixRange);
	}

	function getConfig() {
		let form = document.querySelector("form");
		let cfg = {};

		numberFields.forEach(name => {
			cfg[name] = Number(form.querySelector(`[name=${name}]`).value);
		});

		boolFields.forEach(name => {
			cfg[name] = form.querySelector(`[name=${name}]`).checked;
		});

		cfg.shapeTypes = [];
		let shapeFields = Array.from(form.querySelectorAll(`[name=${shapeField}]`));
		shapeFields.forEach(input => {
			if (!input.checked) { return; }
			cfg.shapeTypes.push(shapeMap[input.value]);
		});

		let fillFields = Array.from(form.querySelectorAll(`[name=${fillField}]`));
		fillFields.forEach(input => {
			if (!input.checked) { return; }
			
			switch (input.value) {
				case "auto": cfg.fill = "auto"; break;
				case "fixed": cfg.fill = form.querySelector("[name='fill-color']").value; break;
			}
		});

		return cfg;
	}

	/* State: target canvas, current canvas and a distance value */
	class State {
		constructor(target, canvas, distance = Infinity) {
			this.target = target;
			this.canvas = canvas;
			this.distance = (distance == Infinity ? target.distance(canvas) : distance);
		}
	}

	/* Step: a Shape, color and alpha */
	class Step {
		constructor(shape, cfg) {
			this.shape = shape;
			this.cfg = cfg;
			this.alpha = cfg.alpha;
			
			/* these two are computed during the .compute() call */
			this.color = "#000";
			this.distance = Infinity;
		}

		toSVG() {
			let node = this.shape.toSVG();
			node.setAttribute("fill", this.color);
			node.setAttribute("fill-opacity", this.alpha.toFixed(2));
			return node;
		}

		/* apply this step to a state to get a new state. call only after .compute */
		apply(state) {
			let newCanvas = state.canvas.clone().drawStep(this);
			return new State(state.target, newCanvas, this.distance);
		}

		/* find optimal color and compute the resulting distance */
		compute(state) {
			let pixels = state.canvas.node.width * state.canvas.node.height;
			let offset = this.shape.bbox;

			let imageData = {
				shape: this.shape.rasterize(this.alpha).getImageData(),
				current: state.canvas.getImageData(),
				target: state.target.getImageData()
			};

			let {color, differenceChange} = computeColorAndDifferenceChange(offset, imageData, this.alpha);
			this.color = color;
			let currentDifference = distanceToDifference(state.distance, pixels);
			if (-differenceChange > currentDifference) debugger;
			this.distance = differenceToDistance(currentDifference + differenceChange, pixels);

			return Promise.resolve(this);
		}

		/* return a slightly mutated step */
		mutate() {
			let newShape = this.shape.mutate(this.cfg);
			let mutated = new this.constructor(newShape, this.cfg);
			if (this.cfg.mutateAlpha) {
				let mutatedAlpha = this.alpha + (Math.random()-0.5) * 0.08;
				mutated.alpha = clamp(mutatedAlpha, .1, 1);
			}
			return mutated;
		}
	}

	class Optimizer {
		constructor(original, cfg) {
			this.cfg = cfg;
			this.state = new State(original, Canvas.empty(cfg));
			this._steps = 0;
			this.onStep = () => {};
			console.log("initial distance %s", this.state.distance);
		}

		start() {
			this._ts = Date.now();
			this._addShape();
		}

		_addShape() {
			this._findBestStep().then(step => this._optimizeStep(step)).then(step => {
				this._steps++;
				if (step.distance < this.state.distance) { /* better than current state, epic */
					this.state = step.apply(this.state);
					console.log("switched to new state (%s) with distance: %s", this._steps, this.state.distance);
					this.onStep(step);
				} else { /* worse than current state, discard */
					this.onStep(null);
				}
				this._continue();
			});
		}

		_continue() {
			if (this._steps < this.cfg.steps) {
				setTimeout(() => this._addShape(), 10);
			} else {
				let time = Date.now() - this._ts;
				console.log("target distance %s", this.state.distance);
				console.log("real target distance %s", this.state.target.distance(this.state.canvas));
				console.log("finished in %s", time);
			}
		}

		_findBestStep() {
			const LIMIT = this.cfg.shapes;

			let bestStep = null;
			let promises = [];

			for (let i=0;i<LIMIT;i++) {
				let shape = Shape.create(this.cfg);

				let promise = new Step(shape, this.cfg).compute(this.state).then(step => {
					if (!bestStep || step.distance < bestStep.distance) {
						bestStep = step;
					}
				});
				promises.push(promise);
			}

			return Promise.all(promises).then(() => bestStep);
		}

		_optimizeStep(step) {
			const LIMIT = this.cfg.mutations;

			let totalAttempts = 0;
			let successAttempts = 0;
			let failedAttempts = 0;
			let resolve = null;
			let bestStep = step;
			let promise = new Promise(r => resolve = r);

			let tryMutation = () => {
				if (failedAttempts >= LIMIT) {
					console.log("mutation optimized distance from %s to %s in (%s good, %s total) attempts", arguments[0].distance, bestStep.distance, successAttempts, totalAttempts);
					return resolve(bestStep);
				}

				totalAttempts++;
				bestStep.mutate().compute(this.state).then(mutatedStep => {
					if (mutatedStep.distance < bestStep.distance) { /* success */
						successAttempts++;
						failedAttempts = 0;
						bestStep = mutatedStep;
					} else { /* failure */
						failedAttempts++;
					}
					
					tryMutation();
				});
			};

			tryMutation();

			return promise;
		}
	}

	/**
	 * Validates a matchlist
	 *
	 * As the name implies. If the matchlist is invalid it
	 * throws a `TypeError`. If it is valid, it returns a brand new matchlist with
	 * a copy of all the MatchOptions passed in.
	 *
	 * What makes a matchlist valid?
	 *
	 * * Each object in the matchlist must be an object (and not like a string or something).
	 * * Each object in the matchlist must have exactly one of {accept, offer} be
	 *   set to a string value indicating its "accept" or "offer" protocol
	 * * Each "accept" protocol can only appear once as an "accept" protocol, and
	 *   likewise each "offer" protocol may only appear once as an "offer" protocol.
	 * * However, An "accept" protocol may appear as an "offer" protocol in a separate
	 *   MatchOption, in case the protocol doesn't have an obvious "accept" or "offer"
	 *   side.
	 *
	 * @param matchlist A matchlist to validate.
	 */
	function validateMatchlist(matchlist) {
	    if (!Array.isArray(matchlist))
	        matchlist = [matchlist];
	    // Keep track of whether a protocol has appeared as an accept or offer before
	    // to make sure there aren't duplicates.
	    let accepting = {};
	    let offering = {};
	    return matchlist.map(matchOption => {
	        // A MatchOption must be an object
	        if (typeof matchOption !== 'object' || Array.isArray(matchOption))
	            throw TypeError('Poppy.io: match-not-an-object');
	        // Only one of {accept, offer} may be defined
	        if (typeof matchOption.accept !== 'undefined' && typeof matchOption.offer !== 'undefined') {
	            throw TypeError('Poppy.io: both-accept-and-offer');
	        }
	        let hasAccept = typeof matchOption.accept === 'string';
	        let hasOffer = typeof matchOption.offer === 'string';
	        if (hasAccept) {
	            // You can only accept a protocol once
	            if (matchOption.accept in accepting) {
	                throw TypeError('Poppy.io: duplicate-accept');
	            }
	            accepting[matchOption.accept] = 1;
	            return {
	                accept: matchOption.accept,
	                hint: matchOption.hint
	            };
	        } else if (hasOffer) {
	            // You can only offer a protocol once
	            if (matchOption.offer in offering) {
	                throw TypeError('Poppy.io: duplicate-offer');
	            }
	            offering[matchOption.offer] = 1;
	            return {
	                offer: matchOption.offer,
	                hint: matchOption.hint
	            };
	        } else {
	            // You have to accept or offer something.
	            throw TypeError('Poppy.io: missing-accept-or-offer');
	        }
	    });
	}

	/**
	 * The poppy dialog window
	 *
	 * A `Dialog` manages the popup window that hosts a poppy. It
	 * opens the window (and creates the `<iframe>` sandbox), closes it automatically
	 * when the page unloads, detects if the window is closed and does appropriate
	 * cleanup, and makes sure only one dialog is open at a time.
	 *
	 * It also triggers the Poppy I/O browser extension if that's available. In that
	 * case the browser extension manages the popup window, but this class still
	 * manages the proxy iframe and handles cleanup after the extension tells us the
	 * window is closed.
	 *
	 * Aside from that it has to be bound to a [[DialogOpener]] in order to do anything
	 * useful.
	 *
	 * You generally don't have to care about this class at all. But you might want
	 * to make use of it if:
	 *
	 *  1.  You want to be able to close the dialog before [[DialogOpener.match]]
	 *      resolves.
	 *  2.  You need to do something asynchronously between the time the user initiates
	 *      opening the poppy and you know what to do with it. If you don't want
	 *      your popup blocked you have to open it synchronously.
	 *  3.  As a special case of (3), you want to defer loading code for as long as
	 *      possible. This class is designed to be relatively minimal and everything
	 *      else in `poppyio.js` can be loaded asynchronously after it.
	 *
	 * For (1) and (2), the easiest thing to do is start with a `DialogOpener` and call the
	 * open() method, and then use the `Dialog` you get back to establish a
	 * connection rather than the `DialogOpener`. They're both [[Matcher]]s.
	 *
	 * For (3), Create a new `Dialog`, call [[Dialog.open]] to open the window, and then
	 * start loading the rest of the code. In order for a `Dialog` to do its
	 * job as a `Matcher`, it must be bound to a `DialogOpener`. To do that,
	 * grab a `DialogOpener`, and call [[DialogOpener.bind]] passing it the `PoppyDialog`. After
	 * that, you can use your `PoppyDialog` as a `Matcher` and establish
	 * your connection.
	 *
	 * You can use the [[Dialog.popup]] property to access the popup window
	 * and display some sort of loading message while you do your thing asychronously,
	 * but if a browser extension is involved that won't be available. So check first.
	 *
	 */
	class Dialog {
	    /**
	     * The constructor.
	     *
	     * Unless you have a specific reason to use this the easier way to get
	     * a `Dialog` is through [[Dialog.open]]. Granted it will already
	     * be open so maybe that's not what you want.
	     */
	    constructor() {
	        this.state = 'unopened';
	        this.intercepted = false;
	        // bind() doesn't just set this.opener = opener, it also blesses us with
	        // whatever X interface the opener provides.
	        this.closed = new Promise(resolve => {
	            this.cancel = () => {
	                resolve();
	                if (this.state !== 'closed') {
	                    this.state = 'closed';
	                    removeEventListener('unload', this.cancel);
	                    if (this.popup) {
	                        try {
	                            this.popup.close();
	                        } catch (e) {
	                            this.proxy.contentWindow.pio_close(this.popup);
	                        }
	                    }
	                    this.proxy.parentNode.removeChild(this.proxy);
	                }
	            };
	        });
	    }
	    /**
	     * Open up a dialog window, but dont do anything with it yet.
	     *
	     * This just sets everything up for [[request]]. The only reason you would need
	     * to call this is you need to do something asyncronously before you can
	     * call `request`, for example load some other modules, since opening a
	     * popup window has to triggered synchronously by a user action. Otherwise
	     * calling `request` will take care of opening the popup for you.
	     *
	     * This will throw an exception if we weren't able to open up the popup
	     * window, like if the user has an overzealous popup blocker.
	     *
	     * It's okay to call this method more than once before `request` is called
	     * and we move into the `matching` state. Not sure why you'd want to though.
	     *
	     * @param options Options that would come from the [[DialogOpener]], but won't
	     *                because the `DialogOpener` doesn't exist yet. The only
	     *                property currently relevant is [[DialogOpenerProperties.iePrelude]].
	     */
	    open(options) {
	        if (this.state === 'unopened') {
	            options = options || {};
	            if (Dialog.current) {
	                Dialog.current.cancel();
	            }
	            Dialog.current = this;
	            let popup;
	            let proxy = this.proxy = document.createElement('iframe');
	            proxy.style.display = 'none';
	            document.body.appendChild(proxy);
	            const sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock';
	            try {
	                // TypeScript 2.8.3 DOM lib has the wrong type
	                proxy.sandbox.value = sandbox;
	            } catch (e) {
	                // Used to be a string and still is in UC Browser. 
	                proxy.sandbox = sandbox;
	            }
	            // Close the popup when the page is unloaded
	            addEventListener('unload', this.cancel);
	            // Trigger the browser extension
	            if (typeof CustomEvent === 'function') {
	                this.intercepted = !proxy.dispatchEvent(new CustomEvent('https://poppy.io/a/open', {
	                    bubbles: true,
	                    cancelable: true
	                }));
	            }
	            let inject = (name, func) => {
	                proxy.contentWindow[name] = func;
	                if (!options.noInject) {
	                    proxy.contentDocument.write(`<script>${ name }=${ func.toString() }</script>`);
	                }
	            };
	            if (!this.intercepted) {
	                // Actually open the popup window.
	                let iePrelude = navigator.userAgent.match(/Trident/) && options.iePrelude;
	                popup = this.popup = proxy.contentWindow.open(iePrelude || 'about:blank', undefined, `scrollbars=1,resizable=1,` + `width=${ window.outerWidth - 100 },` + `height=${ window.outerHeight - 120 },` + `left=${ window.screenX + 40 },` + `top=${ window.screenY + 40 }`);
	                if (!popup) {
	                    throw new Error('Poppy.io: popup-blocked');
	                }
	                inject('pio_nav', (popup, url) => {
	                    popup.location.replace(url);
	                });
	                inject('pio_close', popup => {
	                    popup.close();
	                });
	                try {
	                    popup.location.replace('about:blank');
	                } catch (e) {
	                    proxy.contentWindow.pio_nav(popup, 'about:blank');
	                }
	                // popup.location.replace('about:blank');
	                // Detect if the popup is closed. I don't think there's an event
	                // for us to listen for so we poll. :(
	                let pollInterval = setInterval(() => {
	                    if (popup.closed) {
	                        clearInterval(pollInterval);
	                        this.cancel();
	                    }
	                }, 100);
	            } else {
	                // If our window open was intercepted by a browser extension they
	                // are the ones to manage the popup. We get this event after it's
	                // closed so we can clean up on our end.
	                proxy.contentWindow.addEventListener('https://poppy.io/a/close', () => this.cancel());
	            }
	            this.state = 'opened';    // I mean I should hope so.
	        }
	        return this;
	    }
	    /**
	     * Connect to a peer. Yay! See [[Matcher.match]] for how to
	     * use it. This will take care of opening the popup for you so you don't
	     * need to call [[open]] first.
	     *
	     * In order for this to be useful this `Dialog` needs to be bound to a
	     * [[DialogOpener]]. See [[opener]] for how that happens. If it isn't it the
	     * promise will reject. It will also reject if we can't open a popup.
	     *
	     * @param matchlist
	     */
	    match(matchlist) {
	        try {
	            if (!this.opener)
	                throw Error('Poppy.io: No Connector');
	            return this.opener.match(matchlist, this);
	        } catch (e) {
	            console.log(e);
	            this.cancel();
	            return Promise.reject(e);
	        }
	    }
	}

	const URL_PATTERN = /^[A-Za-z\+\.\-]+\:\/\/[^/]+/;
	/**
	 * Starting point for opening a poppy
	 *
	 * A `DialogOpener` opens a dialog window. It's a reusable object that you
	 * can use to create as many [[Dialog]] windows as you want. You can use a
	 * `DialogOpener` as a template to make other `DialogOpener`s via the
	 * [[DialogOpener.with]] method, which creates a new `DialogOpener` with
	 * the object you called the method on as its `prototype`.
	 *
	 * The easiest way to use `DialogOpener` is to use [[Opener]] instead, which
	 * adds the SOAP functions as methods on the object.
	 */
	class DialogOpener {
	    /**
	     * Constructor
	     * @param properties proeprties to initialize this object with
	     */
	    constructor(properties) {
	        this.strings = [];
	        this.namecheck = false;
	        this.origins = [];
	        this.assign(properties || {});
	    }
	    /**
	     * Open an empty dialog window.
	     */
	    open() {
	        return this.bind(new Dialog()).open(this);
	    }
	    /**
	     * Perform a match operation.
	     *
	     * @param match  Matchlist to match against services
	     * @param client If specified, a dialog that is bound to this opener.
	     */
	    match(matchlist, dialog) {
	        try {
	            let validatedMatchlist = validateMatchlist(matchlist);
	            dialog = dialog && dialog.open() || this.open();
	            if (dialog.popup) {
	                if (this.url) {
	                    dialog.origins.push(getOrigin(this.url));
	                    dialog.popup.location.replace(this.url);
	                } else if (typeof this.launcher === 'function') {
	                    this.launcher(dialog, validatedMatchlist);
	                } else if (typeof this.launcher === 'string') {
	                    dialog.popup.location.replace(this.launcher);
	                }
	            }
	            if (dialog.state !== 'opened')
	                throw Error('Poppy.io: not-connectable, ' + dialog.state);
	            dialog.state = 'matching';
	            let connectPromise = new Promise((resolve, reject) => {
	                dialog.proxy.contentWindow.addEventListener('message', ev => {
	                    try {
	                        // Origin check
	                        let trusted = ev.origin === location.protocol + '//' + location.host || ev.origin === dialog.proxy.getAttribute('data-piox-origin');
	                        if (!trusted && dialog.origins.indexOf(ev.origin) === -1) {
	                            return;
	                        }
	                        // Get body
	                        if (!ev.data)
	                            return;
	                        let body = ev.data['https://poppy.io/a/to-client'];
	                        if (!body) {
	                            return;
	                        }
	                        // Set Origins
	                        if (body.origins) {
	                            if (Array.isArray(body.origins)) {
	                                dialog.origins = body.origins.filter(s => typeof s === 'string');
	                            }
	                        }
	                        // Cancel
	                        if (body.close) {
	                            dialog.cancel();
	                            resolve(undefined);
	                            return;
	                        }
	                        // Listen
	                        if (body.listen) {
	                            if (dialog.state !== 'matching') {
	                                ev.source.postMessage({ 'https://poppy.io/a/to-host': { expired: true } }, ev.origin);
	                            }
	                            onListen(dialog, validatedMatchlist, ev, trusted, resolve, reject);
	                            return;
	                        }
	                    } catch (e) {
	                        dialog.cancel();
	                        reject(e);
	                    }
	                });
	            });
	            return Promise.race([
	                connectPromise,
	                dialog.closed
	            ]);
	        } catch (e) {
	            if (dialog)
	                dialog.cancel();
	            return Promise.reject(e);
	        }
	    }
	    /**
	     * Creates a new `DialogOpener` with this `DialogOpener` as its prototype.
	     * This allows you to use one `DialogOpener` as a template for others. All
	     * the enumerable own-properties in `properties` will be assigned in the
	     * newly created opener; anything not assigned will be inherited from this
	     * object (or its prototypes).
	     *
	     * Note that any changes you make to this object will be reflected in all
	     * descended objects created through `with()` that have not overriden the property.
	     *
	     * @param properties Properties to assign in the child. Any properties not
	     *                   assigned will be inherited from the parent (this object).
	     *
	     */
	    with(properties) {
	        return Object.create(this).assign(properties);
	    }
	    /**
	     * Assign properties on this object in bulk. All enumerable, own-properties
	     * in the `properties` object will be assigned.
	     *
	     * @param properties Properties to assign
	     */
	    assign(properties) {
	        Object.keys(properties).forEach(prop => this[prop] = properties[prop]);
	        return this;
	    }
	    /**
	     * Binds a [[Dialog]] that was created without any `DialogOpener` to this one.
	     *
	     * This sets the [[Dialog.opener]] to this `DialogOpener`.
	     *
	     * @param what A [[Dialog]] that was created indepedent of a `DialogOpener`
	     */
	    bind(what) {
	        what.opener = this;
	        what.origins = this.origins || [];
	        return what;
	    }
	    /**
	     * Retrieves a localized string from [[DialogOpener.strings]], using
	     * [[DialogOpener.lang]] for the language. Currently it only does a
	     * simple comparison of locale tags - en-US and en are treated as entirely
	     * different.
	     *
	     * @param key key of the string to retrieve
	     */
	    getString(key) {
	        return (this.strings || []).reduce((prev, curr) => {
	            if (!curr[key])
	                return prev;
	            if (curr.lang !== this.lang)
	                return prev;
	            return curr;
	        })[key];
	    }
	}
	/**
	 * Handle a `listen` message from a service
	 *
	 * @param dialog The open dialog
	 * @param myMatchlist The matchlist we are sending
	 * @param trigger The event the `listen` came with
	 * @param trusted True if the origin is trusted and should get launch information
	 * @param resolve Function to resolve the match promise with
	 * @param reject Function to reject the match promise with
	 */
	function onListen(dialog, myMatchlist, trigger, trusted, resolve, reject) {
	    // Service connects by sending us a message over the control channel
	    let controlChannel = new MessageChannel();
	    let session = undefined;
	    let requestMessage = {
	        request: myMatchlist,
	        lang: dialog.opener.lang
	    };
	    // Trusted origins (browser extensions and same origin) get extra information
	    // suitable for implementing a launcher
	    if (trusted) {
	        requestMessage.launch = {
	            clientName: dialog.opener.clientName,
	            activityName: dialog.opener.activityName,
	            service: dialog.opener.url
	        };
	    }
	    // Inform service of request and wait for connect()
	    trigger.source.postMessage({ 'https://poppy.io/a/to-host': requestMessage }, trigger.origin, [controlChannel.port1]);
	    let controlPort = controlChannel.port2;
	    controlPort.onmessage = ev => {
	        // Await connect message
	        try {
	            if (!ev.data)
	                return;
	            if (ev.data.close && session)
	                session.cancel();
	            if (!ev.data.connect)
	                return;
	            if (dialog.state !== 'matching') {
	                throw Error('Poppy.io: not connectable');
	            }
	            let theirMatchlist = validateMatchlist(ev.data.proposals);
	            // Verify role is valid
	            let peerRole = ev.data.role;
	            if (peerRole !== 'accept' && peerRole !== 'offer') {
	                throw Error('Poppy.io: unrecognized role');
	            }
	            let myRole = peerRole === 'accept' ? 'offer' : 'accept';
	            let protocol = ev.data.protocol;
	            if (typeof ev.data.protocol !== 'string') {
	                throw Error('Poppy.io: match is not a string');
	            }
	            // Verify protocol/role matches something we asked for
	            if (!myMatchlist.some(req => req[myRole] === protocol)) {
	                throw Error('Poppy.io: no local match');
	            }
	            // Verify protocol/role is present in proposals list
	            let theirMatch = undefined;
	            for (let i = 0; i < theirMatchlist.length; i++) {
	                if (theirMatchlist[i][peerRole] === protocol) {
	                    theirMatch = theirMatchlist[i];
	                }
	            }
	            if (!theirMatch) {
	                throw Error('Poppy.io: no peer match');
	            }
	            // Verify control port is present
	            if (ev.ports.length < 1) {
	                throw Error('Poppy.io: no ports');
	            }
	            session = dialog.session = {
	                port: ev.ports[0],
	                origin: trigger.origin,
	                matchlist: theirMatchlist,
	                accepting: theirMatch.offer,
	                offering: theirMatch.accept,
	                hint: theirMatch.hint,
	                closed: dialog.closed,
	                cancel: dialog.cancel.bind(dialog),
	                release() {
	                    controlPort.postMessage('release');
	                    controlPort.close();
	                    ev.ports[0].close();
	                }
	            };
	            dialog.state = 'connected';
	            resolve(session);
	        } catch (e) {
	            dialog.cancel();
	            reject(e);
	        }
	    };
	}
	function getOrigin(url, relativeTo) {
	    let match = url.match(URL_PATTERN);
	    if (!match) {
	        if (relativeTo)
	            return getOrigin(relativeTo);
	        return '';
	    } else {
	        return match[0];
	    }
	}

	/**
	 * Turn BeginAcceptObjectArgs/BeginOfferObjectArgs into a matchlist and establish a
	 * connection, or if we are connecting to an already open session verify there
	 * is a protocol match.
	 *
	 * @param connectTo Session or SessionRequester to connect to
	 * @param args The Args object passed to the function.
	 * @param side Whether we are accepting or offering.
	 */
	function connectSOAP(connectTo, kinds, side) {
	    if (!kinds)
	        return Promise.reject(Error('No kind specified'));
	    let matchlist = [];
	    let filesMatchInList = false;
	    let filesMatch = {
	        [side]: 'File',
	        hint: { types: [] }
	    };
	    if (Array.isArray(kinds)) {
	        kinds.forEach(kind => {
	            if (isFileType(kind)) {
	                if (!filesMatchInList) {
	                    matchlist.push(filesMatch);
	                    filesMatchInList = true;
	                }
	                filesMatch.hint.types.push(kind);
	            } else {
	                matchlist.push({ [side]: kinds });
	            }
	        });
	    } else {
	        if (typeof kinds === 'string') {
	            if (isFileType(kinds)) {
	                filesMatch.hint.types.push(kinds);
	                matchlist.push(filesMatch);
	                filesMatchInList = true;
	            } else {
	                matchlist.push({ [side]: kinds });
	            }
	        } else {
	            let actualKinds = Array.isArray(kinds.kind) ? kinds.kind : [kinds.kind];
	            actualKinds.forEach(kind => {
	                if (isFileType(kind)) {
	                    if (!filesMatchInList) {
	                        matchlist.push(filesMatch);
	                        filesMatchInList = true;
	                        if ('hint' in kinds) {
	                            filesMatch.hint = kinds.hint;
	                            filesMatch.hint.types = [];
	                        }
	                    }
	                    filesMatch.hint.types.push(kind);
	                } else {
	                    let hint = {};
	                    if ('hint' in kinds) {
	                        hint = kinds.hint;
	                    } else {
	                        Object.keys(kinds).forEach(key => {
	                            if (key !== 'kind')
	                                hint[key] = kinds[key];
	                        });
	                    }
	                    matchlist.push({ [side]: kinds });
	                }
	            });
	        }
	    }
	    let protocols = matchlist.map(match => match[side]);
	    // If connectTo is a PoppySession we check if it's a match.
	    if ('port' in connectTo && !('request' in connectTo)) {
	        if (!protocols.some(p => side === 'accept' && p === connectTo.accepting || side === 'offer' && p === connectTo.offering)) {
	            return Promise.reject(Error('Session match failed'));
	        }
	        if (connectTo.port.onmessage) {
	            return Promise.reject('already an onmessage listener on the port');
	        }
	        return Promise.resolve(connectTo);
	    }
	    // // Otherwise connectTo.request() does the matching.
	    // let matchlist: MatchOption[] = protocols.map(p => ({
	    // 	hint: args.hint,
	    // 	[side]: p
	    // }));
	    return connectTo.match(matchlist);
	}
	/**
	 * Move data properties up to the parent object if their property names begin
	 * with a capital letter or contain a colon.
	 */
	function moveAspectsUp(amalgam) {
	    if (amalgam.data) {
	        for (let key in amalgam.data) {
	            if (key.match(/^[A-Z]|\:/))
	                amalgam[key] = amalgam.data[key];
	        }
	    }
	}
	function isFileType(kind) {
	    return kind.match(/^[a-zA-Z]+\//) || kind.indexOf('.') === 0;
	}

	/**
	 * Accepts an object via Simple Offer/Accept Protocol from a peer.
	 *
	 *  - Resolves to an AcceptedObject if an object was successfully accepted. The
	 *    session may still be open after this function resolves.
	 *  - Resolves to nothing if a session was never established.
	 *
	 *  - Will reject if the session is closed before we are able to reply, even if
	 *    we did not reply with any value. Will reject on protocol and other errors.
	 *
	 * A value to reply with may be provided via the args.reply option.
	 *
	 * @param from Session, Dialog or Opener to accept the object from
	 * @param args Request details
	 */
	function acceptObject(from, kinds, reply) {
	    return beginAcceptObject(from, kinds).then(acceptedObject => {
	        // Not an error, session never established.
	        if (!acceptedObject) {
	            return Promise.resolve(undefined);
	        }
	        try {
	            // Turn args.reply into a value to hand off to acceptedObject.resolve().
	            // Note if reply is a function it may call acceptedObject.resolve()
	            // itself so whatever value is returned is basically ignored.
	            let replyValuePromise = Promise.resolve(typeof reply === 'function' ? reply(acceptedObject) : reply);
	            return replyValuePromise.then(replyValue => {
	                return acceptedObject.resolve(replyValue).then(success => {
	                    if (success)
	                        return Promise.resolve(acceptedObject);
	                    return Promise.reject(Error('incomplete'));
	                });
	            });
	        } catch (e) {
	            // reject if args.reply throws
	            acceptedObject.session.cancel();
	            return Promise.reject(e);
	        }
	    });
	}
	/**
	 * Accepts an object from a peer via Simple Offer/Accept Protocol but doesn't
	 * complete the exchange and send a reply to the peer until the resolve() method
	 * on the returned AcceptedObject is called (with optional response data)
	 *
	 *  - Resolves with an AcceptedObject if the peer sent an object message to us.
	 *  - Resolves to nothing if a session is never established.
	 *
	 *  - Will reject on protocol and other errors.
	 *
	 * @param from Session, Dialog or Opener to accept the object from
	 * @param args Request details
	 */
	function beginAcceptObject(from, args) {
	    return connectSOAP(from, args, 'accept').then(session => {
	        // Not an error, session never established.
	        if (!session) {
	            return Promise.resolve(undefined);
	        }
	        let receivedObjectFromPeer = false;
	        return new Promise((resolveReceived, rejectReceived) => {
	            let sentReplyToPeer = false;
	            let donePromise = new Promise(resolveDone => {
	                session.port.onmessage = ev => {
	                    if (!receivedObjectFromPeer) {
	                        // Received first message with object data from the peer.
	                        receivedObjectFromPeer = true;
	                        let accepted = {
	                            session,
	                            origin: session.origin,
	                            kind: session.accepting,
	                            hint: session.hint,
	                            matchlist: session.matchlist,
	                            data: ev.data,
	                            ports: ev.ports,
	                            resolve(data, transfer) {
	                                if (!sentReplyToPeer) {
	                                    sentReplyToPeer = true;
	                                    session.port.postMessage(data, transfer || []);
	                                }
	                                return donePromise;
	                            }
	                        };
	                        moveAspectsUp(accepted);
	                        resolveReceived(accepted);
	                    } else {
	                        // Received second and final message acknowledging the reply
	                        // was received and it is safe to close.
	                        resolveDone(true);
	                        session.release();
	                        return;
	                    }
	                };
	                // Resolve promises if the session is closed before receiving all
	                // messages
	                session.closed.then(() => {
	                    rejectReceived(Error('Did not receive object'));
	                    // We will not treat it as an error if the session is closed
	                    // after we sent a reply even if we did not get acknowledgement
	                    // of the reply.
	                    if (sentReplyToPeer)
	                        resolveDone(true);
	                    else
	                        resolveDone(false);
	                });
	            });
	        });
	    });
	}

	function offerObject(to, kinds, data) {
	    return beginOfferObject(to, kinds).then(offer => {
	        if (!offer)
	            return Promise.resolve(undefined);
	        try {
	            return Promise.resolve(typeof data === 'function' ? data(offer) : data).then(post => {
	                return offer.resolve(post).then(accepted => {
	                    if (accepted)
	                        return Promise.resolve(accepted);
	                    return Promise.reject(Error('Protocol error: no response'));
	                });
	            });
	        } catch (e) {
	            offer.session.cancel();
	            return Promise.reject(e);
	        }
	    });
	}
	function beginOfferObject(to, kinds) {
	    return connectSOAP(to, kinds, 'offer').then(session => {
	        if (!session)
	            return Promise.resolve(undefined);
	        let resolved = undefined;
	        let resolve = (data, transfer) => {
	            if (resolved)
	                return resolved;
	            if (transfer)
	                session.port.postMessage(data, transfer);
	            else
	                session.port.postMessage(data);
	            return resolved = new Promise((resolve, reject) => {
	                session.port.onmessage = ev => {
	                    let accepted = {
	                        data: ev.data,
	                        ports: ev.ports
	                    };
	                    moveAspectsUp(accepted);
	                    resolve(accepted);
	                };
	                session.closed.then(() => {
	                    reject(new Error('Session closed before acknowlegded'));
	                });
	            });
	        };
	        return Promise.resolve({
	            session,
	            origin: session.origin,
	            kind: session.offering,
	            hint: session.hint,
	            resolve
	        });
	    });
	}

	function soapify(unsoapy) {
	    unsoapy.accept = function (kinds, reply) {
	        return acceptObject(this, kinds, reply);
	    };
	    unsoapy.beginAccept = function (kinds) {
	        return beginAcceptObject(this, kinds);
	    };
	    unsoapy.offer = function (kinds, data) {
	        return offerObject(this, kinds, data);
	    };
	    unsoapy.beginOffer = function (kinds) {
	        return beginOfferObject(this, kinds);
	    };
	    return unsoapy;
	}

	/**
	 * `DialogOpener` + `SoapMixin`
	 *
	 * This [[DialogOpener]] subclass implements [[SoapMixin]] and adds it to the
	 * [[Dialog]]s it creates to make it more convenient to use.
	 *
	 * It also maintains a global base `Opener` ([[Opener.base]]) which the `"use-*"`
	 * modules configure to use the default [[starter]] launcher and install their
	 * localized strings into.
	 */
	class Poppy extends DialogOpener {
	    /**
	     * Constructor
	     *
	     * @param properties dialog opener properties
	     */
	    constructor(properties) {
	        super(properties);
	        soapify(this);
	    }
	    /**
	     * Equivalent to `Opener.any().with(...)`, saves a little typing.
	     *
	     * @param properties properties to override in new `Opener`
	     */
	    static with(properties) {
	        return this.any().with(properties);
	    }
	    /**
	     * Get the [[Opener.base]] launcher and create it if it wasn't already.
	     */
	    static any() {
	        return this.base || (this.base = new Poppy());
	    }
	    /**
	     * Binds [[Dialog]] to this [[Opener]] and adds [[SoapMixin]] to it
	     *
	     * @param dialog
	     */
	    bind(dialog) {
	        return soapify(super.bind(dialog));
	    }
	    /**
	     * Open this [[Dialog]] with an empty scri
	     */
	    open() {
	        return this.bind(super.open());
	    }
	    static accept(kinds, reply) {
	        return this.any().accept(kinds, reply);
	    }
	    static beginAccept(kinds) {
	        return this.any().beginAccept(kinds);
	    }
	    static offer(kinds, data) {
	        return this.any().offer(kinds, data);
	    }
	    static beginOffer(kinds) {
	        return this.any().beginOffer(kinds);
	    }
	}

	// Export core
	/**
	 * Version of poppyio.js
	 */
	const version = '0.0.6';

	/** Translated strings used by launchDialog ($Lang$) */
	var strings = {
	  "lang": "en",
	  "langName": "English",
	  "connectPoppy": "Connect Poppy",
	  "explanation": "Enter the domain name of a website above to connect to its poppy.",
	  "checking": "Checking if {search} will work...",
	  "sendingYou": "Sending you to {search}...",
	  "wontWork": "It looks like {search} won't work.",
	  "wontWorkNowWhat": "{search} doesn't appear to offer a poppy. However it's possible that you\ntyped in the name incorrectly.",
	  "ok": "OK",
	  "go": "Go",
	  "cancel": "Cancel"
	};

	// Copied from tweetnacl-js, removed everything not needed by crypto_sign_open
	// https://github.com/dchest/tweetnacl-js/blob/e5ca74e977e15b0fdbf58bdd36955dd8c6d823e2/nacl.js

	// Ported in 2014 by Dmitry Chestnykh and Devi Mandiri.
	// Public domain.
	//
	// Implementation derived from TweetNaCl version 20140427.
	// See for details: http://tweetnacl.cr.yp.to/

	var u64 = function(h, l) {
	    return {
	        h: h|0 >>> 0,
	        l: l|0 >>> 0
	    }
	};

	var gf = function(init) {
	  var i, r = new Float64Array(16);
	  if (init) for (i = 0; i < init.length; i++) r[i] = init[i];
	  return r;
	};
	var gf0 = gf(),
	    gf1 = gf([1]),
	    D = gf([0x78a3, 0x1359, 0x4dca, 0x75eb, 0xd8ab, 0x4141, 0x0a4d, 0x0070, 0xe898, 0x7779, 0x4079, 0x8cc7, 0xfe73, 0x2b6f, 0x6cee, 0x5203]),
	    D2 = gf([0xf159, 0x26b2, 0x9b94, 0xebd6, 0xb156, 0x8283, 0x149a, 0x00e0, 0xd130, 0xeef3, 0x80f2, 0x198e, 0xfce7, 0x56df, 0xd9dc, 0x2406]),
	    X = gf([0xd51a, 0x8f25, 0x2d60, 0xc956, 0xa7b2, 0x9525, 0xc760, 0x692c, 0xdc5c, 0xfdd6, 0xe231, 0xc0a4, 0x53fe, 0xcd6e, 0x36d3, 0x2169]),
	    Y = gf([0x6658, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666]),
	    I = gf([0xa0b0, 0x4a0e, 0x1b27, 0xc4ee, 0xe478, 0xad2f, 0x1806, 0x2f43, 0xd7a7, 0x3dfb, 0x0099, 0x2b4d, 0xdf0b, 0x4fc1, 0x2480, 0x2b83]);

	function dl64(x, i) {
	  var h = (x[i] << 24) | (x[i+1] << 16) | (x[i+2] << 8) | x[i+3];
	  var l = (x[i+4] << 24) | (x[i+5] << 16) | (x[i+6] << 8) | x[i+7];
	  return u64(h, l);
	}

	function ts64(x, i, u) {
	  x[i]   = (u.h >> 24) & 0xff;
	  x[i+1] = (u.h >> 16) & 0xff;
	  x[i+2] = (u.h >>  8) & 0xff;
	  x[i+3] = u.h & 0xff;
	  x[i+4] = (u.l >> 24)  & 0xff;
	  x[i+5] = (u.l >> 16)  & 0xff;
	  x[i+6] = (u.l >>  8)  & 0xff;
	  x[i+7] = u.l & 0xff;
	}

	function vn(x, xi, y, yi, n) {
	  var i,d = 0;
	  for (i = 0; i < n; i++) d |= x[xi+i]^y[yi+i];
	  return (1 & ((d - 1) >>> 8)) - 1;
	}

	function crypto_verify_32(x, xi, y, yi) {
	  return vn(x,xi,y,yi,32);
	}

	function set25519(r, a) {
	  var i;
	  for (i = 0; i < 16; i++) r[i] = a[i]|0;
	}

	function car25519(o) {
	  var c;
	  var i;
	  for (i = 0; i < 16; i++) {
	      o[i] += 65536;
	      c = Math.floor(o[i] / 65536);
	      o[(i+1)*(i<15?1:0)] += c - 1 + 37 * (c-1) * (i===15?1:0);
	      o[i] -= (c * 65536);
	  }
	}

	function sel25519(p, q, b) {
	  var t, c = ~(b-1);
	  for (var i = 0; i < 16; i++) {
	    t = c & (p[i] ^ q[i]);
	    p[i] ^= t;
	    q[i] ^= t;
	  }
	}

	function pack25519(o, n) {
	  var i, j, b;
	  var m = gf(), t = gf();
	  for (i = 0; i < 16; i++) t[i] = n[i];
	  car25519(t);
	  car25519(t);
	  car25519(t);
	  for (j = 0; j < 2; j++) {
	    m[0] = t[0] - 0xffed;
	    for (i = 1; i < 15; i++) {
	      m[i] = t[i] - 0xffff - ((m[i-1]>>16) & 1);
	      m[i-1] &= 0xffff;
	    }
	    m[15] = t[15] - 0x7fff - ((m[14]>>16) & 1);
	    b = (m[15]>>16) & 1;
	    m[14] &= 0xffff;
	    sel25519(t, m, 1-b);
	  }
	  for (i = 0; i < 16; i++) {
	    o[2*i] = t[i] & 0xff;
	    o[2*i+1] = t[i]>>8;
	  }
	}

	function neq25519(a, b) {
	  var c = new Uint8Array(32), d = new Uint8Array(32);
	  pack25519(c, a);
	  pack25519(d, b);
	  return crypto_verify_32(c, 0, d, 0);
	}

	function par25519(a) {
	  var d = new Uint8Array(32);
	  pack25519(d, a);
	  return d[0] & 1;
	}

	function unpack25519(o, n) {
	  var i;
	  for (i = 0; i < 16; i++) o[i] = n[2*i] + (n[2*i+1] << 8);
	  o[15] &= 0x7fff;
	}

	function A(o, a, b) {
	  var i;
	  for (i = 0; i < 16; i++) o[i] = (a[i] + b[i])|0;
	}

	function Z(o, a, b) {
	  var i;
	  for (i = 0; i < 16; i++) o[i] = (a[i] - b[i])|0;
	}

	function M(o, a, b) {
	  var i, j, t = new Float64Array(31);
	  for (i = 0; i < 31; i++) t[i] = 0;
	  for (i = 0; i < 16; i++) {
	    for (j = 0; j < 16; j++) {
	      t[i+j] += a[i] * b[j];
	    }
	  }
	  for (i = 0; i < 15; i++) {
	    t[i] += 38 * t[i+16];
	  }
	  for (i = 0; i < 16; i++) o[i] = t[i];
	  car25519(o);
	  car25519(o);
	}

	function S(o, a) {
	  M(o, a, a);
	}

	function inv25519(o, i) {
	  var c = gf();
	  var a;
	  for (a = 0; a < 16; a++) c[a] = i[a];
	  for (a = 253; a >= 0; a--) {
	    S(c, c);
	    if(a !== 2 && a !== 4) M(c, c, i);
	  }
	  for (a = 0; a < 16; a++) o[a] = c[a];
	}

	function pow2523(o, i) {
	  var c = gf();
	  var a;
	  for (a = 0; a < 16; a++) c[a] = i[a];
	  for (a = 250; a >= 0; a--) {
	      S(c, c);
	      if(a !== 1) M(c, c, i);
	  }
	  for (a = 0; a < 16; a++) o[a] = c[a];
	}

	function add64() {
	  var a = 0, b = 0, c = 0, d = 0, m16 = 65535, l, h, i;
	  for (i = 0; i < arguments.length; i++) {
	    l = arguments[i].l;
	    h = arguments[i].h;
	    a += (l & m16); b += (l >>> 16);
	    c += (h & m16); d += (h >>> 16);
	  }

	  b += (a >>> 16);
	  c += (b >>> 16);
	  d += (c >>> 16);

	  return u64((c & m16) | (d << 16), (a & m16) | (b << 16));
	}

	function shr64(x, c) {
	  return u64((x.h >>> c), (x.l >>> c) | (x.h << (32 - c)));
	}

	function xor64() {
	  var l = 0, h = 0, i;
	  for (i = 0; i < arguments.length; i++) {
	    l ^= arguments[i].l;
	    h ^= arguments[i].h;
	  }
	  return u64(h, l);
	}

	function R(x, c) {
	  var h, l, c1 = 32 - c;
	  if (c < 32) {
	    h = (x.h >>> c) | (x.l << c1);
	    l = (x.l >>> c) | (x.h << c1);
	  } else if (c < 64) {
	    h = (x.l >>> c) | (x.h << c1);
	    l = (x.h >>> c) | (x.l << c1);
	  }
	  return u64(h, l);
	}

	function Ch(x, y, z) {
	  var h = (x.h & y.h) ^ (~x.h & z.h),
	      l = (x.l & y.l) ^ (~x.l & z.l);
	  return u64(h, l);
	}

	function Maj(x, y, z) {
	  var h = (x.h & y.h) ^ (x.h & z.h) ^ (y.h & z.h),
	      l = (x.l & y.l) ^ (x.l & z.l) ^ (y.l & z.l);
	  return u64(h, l);
	}

	function Sigma0(x) { return xor64(R(x,28), R(x,34), R(x,39)); }
	function Sigma1(x) { return xor64(R(x,14), R(x,18), R(x,41)); }
	function sigma0(x) { return xor64(R(x, 1), R(x, 8), shr64(x,7)); }
	function sigma1(x) { return xor64(R(x,19), R(x,61), shr64(x,6)); }

	var K = [
	  u64(0x428a2f98, 0xd728ae22), u64(0x71374491, 0x23ef65cd),
	  u64(0xb5c0fbcf, 0xec4d3b2f), u64(0xe9b5dba5, 0x8189dbbc),
	  u64(0x3956c25b, 0xf348b538), u64(0x59f111f1, 0xb605d019),
	  u64(0x923f82a4, 0xaf194f9b), u64(0xab1c5ed5, 0xda6d8118),
	  u64(0xd807aa98, 0xa3030242), u64(0x12835b01, 0x45706fbe),
	  u64(0x243185be, 0x4ee4b28c), u64(0x550c7dc3, 0xd5ffb4e2),
	  u64(0x72be5d74, 0xf27b896f), u64(0x80deb1fe, 0x3b1696b1),
	  u64(0x9bdc06a7, 0x25c71235), u64(0xc19bf174, 0xcf692694),
	  u64(0xe49b69c1, 0x9ef14ad2), u64(0xefbe4786, 0x384f25e3),
	  u64(0x0fc19dc6, 0x8b8cd5b5), u64(0x240ca1cc, 0x77ac9c65),
	  u64(0x2de92c6f, 0x592b0275), u64(0x4a7484aa, 0x6ea6e483),
	  u64(0x5cb0a9dc, 0xbd41fbd4), u64(0x76f988da, 0x831153b5),
	  u64(0x983e5152, 0xee66dfab), u64(0xa831c66d, 0x2db43210),
	  u64(0xb00327c8, 0x98fb213f), u64(0xbf597fc7, 0xbeef0ee4),
	  u64(0xc6e00bf3, 0x3da88fc2), u64(0xd5a79147, 0x930aa725),
	  u64(0x06ca6351, 0xe003826f), u64(0x14292967, 0x0a0e6e70),
	  u64(0x27b70a85, 0x46d22ffc), u64(0x2e1b2138, 0x5c26c926),
	  u64(0x4d2c6dfc, 0x5ac42aed), u64(0x53380d13, 0x9d95b3df),
	  u64(0x650a7354, 0x8baf63de), u64(0x766a0abb, 0x3c77b2a8),
	  u64(0x81c2c92e, 0x47edaee6), u64(0x92722c85, 0x1482353b),
	  u64(0xa2bfe8a1, 0x4cf10364), u64(0xa81a664b, 0xbc423001),
	  u64(0xc24b8b70, 0xd0f89791), u64(0xc76c51a3, 0x0654be30),
	  u64(0xd192e819, 0xd6ef5218), u64(0xd6990624, 0x5565a910),
	  u64(0xf40e3585, 0x5771202a), u64(0x106aa070, 0x32bbd1b8),
	  u64(0x19a4c116, 0xb8d2d0c8), u64(0x1e376c08, 0x5141ab53),
	  u64(0x2748774c, 0xdf8eeb99), u64(0x34b0bcb5, 0xe19b48a8),
	  u64(0x391c0cb3, 0xc5c95a63), u64(0x4ed8aa4a, 0xe3418acb),
	  u64(0x5b9cca4f, 0x7763e373), u64(0x682e6ff3, 0xd6b2b8a3),
	  u64(0x748f82ee, 0x5defb2fc), u64(0x78a5636f, 0x43172f60),
	  u64(0x84c87814, 0xa1f0ab72), u64(0x8cc70208, 0x1a6439ec),
	  u64(0x90befffa, 0x23631e28), u64(0xa4506ceb, 0xde82bde9),
	  u64(0xbef9a3f7, 0xb2c67915), u64(0xc67178f2, 0xe372532b),
	  u64(0xca273ece, 0xea26619c), u64(0xd186b8c7, 0x21c0c207),
	  u64(0xeada7dd6, 0xcde0eb1e), u64(0xf57d4f7f, 0xee6ed178),
	  u64(0x06f067aa, 0x72176fba), u64(0x0a637dc5, 0xa2c898a6),
	  u64(0x113f9804, 0xbef90dae), u64(0x1b710b35, 0x131c471b),
	  u64(0x28db77f5, 0x23047d84), u64(0x32caab7b, 0x40c72493),
	  u64(0x3c9ebe0a, 0x15c9bebc), u64(0x431d67c4, 0x9c100d4c),
	  u64(0x4cc5d4be, 0xcb3e42b6), u64(0x597f299c, 0xfc657e2a),
	  u64(0x5fcb6fab, 0x3ad6faec), u64(0x6c44198c, 0x4a475817)
	];

	function crypto_hashblocks(x, m, n) {
	  var z = [], b = [], a = [], w = [], t, i, j;

	  for (i = 0; i < 8; i++) z[i] = a[i] = dl64(x, 8*i);

	  var pos = 0;
	  while (n >= 128) {
	    for (i = 0; i < 16; i++) w[i] = dl64(m, 8*i+pos);
	    for (i = 0; i < 80; i++) {
	      for (j = 0; j < 8; j++) b[j] = a[j];
	      t = add64(a[7], Sigma1(a[4]), Ch(a[4], a[5], a[6]), K[i], w[i%16]);
	      b[7] = add64(t, Sigma0(a[0]), Maj(a[0], a[1], a[2]));
	      b[3] = add64(b[3], t);
	      for (j = 0; j < 8; j++) a[(j+1)%8] = b[j];
	      if (i%16 === 15) {
	        for (j = 0; j < 16; j++) {
	          w[j] = add64(w[j], w[(j+9)%16], sigma0(w[(j+1)%16]), sigma1(w[(j+14)%16]));
	        }
	      }
	    }

	    for (i = 0; i < 8; i++) {
	      a[i] = add64(a[i], z[i]);
	      z[i] = a[i];
	    }

	    pos += 128;
	    n -= 128;
	  }

	  for (i = 0; i < 8; i++) ts64(x, 8*i, z[i]);
	  return n;
	}

	var iv = new Uint8Array([
	  0x6a,0x09,0xe6,0x67,0xf3,0xbc,0xc9,0x08,
	  0xbb,0x67,0xae,0x85,0x84,0xca,0xa7,0x3b,
	  0x3c,0x6e,0xf3,0x72,0xfe,0x94,0xf8,0x2b,
	  0xa5,0x4f,0xf5,0x3a,0x5f,0x1d,0x36,0xf1,
	  0x51,0x0e,0x52,0x7f,0xad,0xe6,0x82,0xd1,
	  0x9b,0x05,0x68,0x8c,0x2b,0x3e,0x6c,0x1f,
	  0x1f,0x83,0xd9,0xab,0xfb,0x41,0xbd,0x6b,
	  0x5b,0xe0,0xcd,0x19,0x13,0x7e,0x21,0x79
	]);

	function crypto_hash(out, m, n) {
	  var h = new Uint8Array(64), x = new Uint8Array(256);
	  var i, b = n;

	  for (i = 0; i < 64; i++) h[i] = iv[i];

	  crypto_hashblocks(h, m, n);
	  n %= 128;

	  for (i = 0; i < 256; i++) x[i] = 0;
	  for (i = 0; i < n; i++) x[i] = m[b-n+i];
	  x[n] = 128;

	  n = 256-128*(n<112?1:0);
	  x[n-9] = 0;
	  ts64(x, n-8, u64((b / 0x20000000) | 0, b << 3));
	  crypto_hashblocks(h, x, n);

	  for (i = 0; i < 64; i++) out[i] = h[i];

	  return 0;
	}

	function add(p, q) {
	  var a = gf(), b = gf(), c = gf(),
	      d = gf(), e = gf(), f = gf(),
	      g = gf(), h = gf(), t = gf();

	  Z(a, p[1], p[0]);
	  Z(t, q[1], q[0]);
	  M(a, a, t);
	  A(b, p[0], p[1]);
	  A(t, q[0], q[1]);
	  M(b, b, t);
	  M(c, p[3], q[3]);
	  M(c, c, D2);
	  M(d, p[2], q[2]);
	  A(d, d, d);
	  Z(e, b, a);
	  Z(f, d, c);
	  A(g, d, c);
	  A(h, b, a);

	  M(p[0], e, f);
	  M(p[1], h, g);
	  M(p[2], g, f);
	  M(p[3], e, h);
	}

	function cswap(p, q, b) {
	  var i;
	  for (i = 0; i < 4; i++) {
	    sel25519(p[i], q[i], b);
	  }
	}

	function pack(r, p) {
	  var tx = gf(), ty = gf(), zi = gf();
	  inv25519(zi, p[2]);
	  M(tx, p[0], zi);
	  M(ty, p[1], zi);
	  pack25519(r, ty);
	  r[31] ^= par25519(tx) << 7;
	}

	function scalarmult(p, q, s) {
	  var b, i;
	  set25519(p[0], gf0);
	  set25519(p[1], gf1);
	  set25519(p[2], gf1);
	  set25519(p[3], gf0);
	  for (i = 255; i >= 0; --i) {
	    b = (s[(i/8)|0] >> (i&7)) & 1;
	    cswap(p, q, b);
	    add(q, p);
	    add(p, p);
	    cswap(p, q, b);
	  }
	}

	function scalarbase(p, s) {
	  var q = [gf(), gf(), gf(), gf()];
	  set25519(q[0], X);
	  set25519(q[1], Y);
	  set25519(q[2], gf1);
	  M(q[3], X, Y);
	  scalarmult(p, q, s);
	}

	var L = new Float64Array([0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd6, 0x9c, 0xf7, 0xa2, 0xde, 0xf9, 0xde, 0x14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x10]);

	function modL(r, x) {
	  var carry, i, j, k;
	  for (i = 63; i >= 32; --i) {
	    carry = 0;
	    for (j = i - 32, k = i - 12; j < k; ++j) {
	      x[j] += carry - 16 * x[i] * L[j - (i - 32)];
	      carry = (x[j] + 128) >> 8;
	      x[j] -= carry * 256;
	    }
	    x[j] += carry;
	    x[i] = 0;
	  }
	  carry = 0;
	  for (j = 0; j < 32; j++) {
	    x[j] += carry - (x[31] >> 4) * L[j];
	    carry = x[j] >> 8;
	    x[j] &= 255;
	  }
	  for (j = 0; j < 32; j++) x[j] -= carry * L[j];
	  for (i = 0; i < 32; i++) {
	    x[i+1] += x[i] >> 8;
	    r[i] = x[i] & 255;
	  }
	}

	function reduce(r) {
	  var x = new Float64Array(64), i;
	  for (i = 0; i < 64; i++) x[i] = r[i];
	  for (i = 0; i < 64; i++) r[i] = 0;
	  modL(r, x);
	}

	function unpackneg(r, p) {
	  var t = gf(), chk = gf(), num = gf(),
	      den = gf(), den2 = gf(), den4 = gf(),
	      den6 = gf();

	  set25519(r[2], gf1);
	  unpack25519(r[1], p);
	  S(num, r[1]);
	  M(den, num, D);
	  Z(num, num, r[2]);
	  A(den, r[2], den);

	  S(den2, den);
	  S(den4, den2);
	  M(den6, den4, den2);
	  M(t, den6, num);
	  M(t, t, den);

	  pow2523(t, t);
	  M(t, t, num);
	  M(t, t, den);
	  M(t, t, den);
	  M(r[0], t, den);

	  S(chk, r[0]);
	  M(chk, chk, den);
	  if (neq25519(chk, num)) M(r[0], r[0], I);

	  S(chk, r[0]);
	  M(chk, chk, den);
	  if (neq25519(chk, num)) return -1;

	  if (par25519(r[0]) === (p[31]>>7)) Z(r[0], gf0, r[0]);

	  M(r[3], r[0], r[1]);
	  return 0;
	}

	function crypto_sign_open(m, sm, n, pk) {
	  var i, mlen;
	  var t = new Uint8Array(32), h = new Uint8Array(64);
	  var p = [gf(), gf(), gf(), gf()],
	      q = [gf(), gf(), gf(), gf()];

	  mlen = -1;
	  if (n < 64) return -1;

	  if (unpackneg(q, pk)) return -1;

	  for (i = 0; i < n; i++) m[i] = sm[i];
	  for (i = 0; i < 32; i++) m[i+32] = pk[i];
	  crypto_hash(h, m, n);
	  reduce(h);
	  scalarmult(p, q, h);

	  scalarbase(q, sm.subarray(32));
	  add(p, q);
	  pack(t, p);

	  n -= 64;
	  if (crypto_verify_32(sm, 0, t, 0)) {
	    for (i = 0; i < n; i++) m[i] = 0;
	    return -1;
	  }

	  for (i = 0; i < n; i++) m[i] = sm[i + 64];
	  mlen = n;
	  return mlen;
	}

	function resolveName(domain, namecheck) {
	    return new Promise((resolve, reject) => {
	        domain = (domain || '').trim().toLowerCase();
	        if (!domain) {
	            return reject(Error('Poppy.io: no-domain'));
	        }
	        if (typeof domain.normalize === 'function') {
	            domain = domain.normalize('NFKC');
	        }
	        let req = new XMLHttpRequest();
	        req.open('GET', 'https://' + domain + '/.well-known/host-meta.json');
	        req.onload = () => {
	            if (req.status !== 200)
	                return reject(Error('Poppy.io: lookup-error, ' + req.status));
	            try {
	                let hostMeta = JSON.parse(req.responseText);
	                let links = hostMeta.links;
	                if (!Array.isArray(links)) {
	                    return reject(Error('Poppy.io: no-dialog-found'));
	                }
	                let result = undefined;
	                for (let i = 0; i < links.length; i++) {
	                    let link = links[i];
	                    if (!link)
	                        continue;
	                    if (link.rel !== 'https://poppy.io/a/poppy')
	                        continue;
	                    if (typeof link.href !== 'string')
	                        continue;
	                    let url = link.href.match(/^[a-zA-Z0-9\-]+\:/) ? link.href : 'https://' + domain + '/' + link.href;
	                    result = { url };
	                    if (link.properties) {
	                        for (let propertyName in link.properties) {
	                            if (propertyName === 'https://poppy.io/a/origins') {
	                                let origins = link.properties[propertyName];
	                                if (typeof origins === 'string') {
	                                    result.origins = origins.split(' ');
	                                }
	                            }
	                        }
	                    }
	                    break;
	                }
	                if (result) {
	                    if (hostMeta.properties && namecheck !== true) {
	                        for (let keyName in namecheckKeys) {
	                            if (typeof hostMeta.properties[keyName] !== 'string')
	                                continue;
	                            if (verifyNamecheck(domain, keyName, hostMeta.properties[keyName], result))
	                                break;
	                        }
	                    }
	                    return resolve(result);
	                }
	                return reject(Error('Poppy.io: no-dialog-found'));
	            } catch (e) {
	                return reject(e);
	            }
	        };
	        req.onerror = () => {
	            console.log('onerror');
	            reject(Error('Poppy.io: lookup-error'));
	        };
	        req.send();
	    });
	}
	function bytesFromBase64(string) {
	    var byteString = atob(decodeURIComponent(escape(string)));
	    var bytes = new Uint8Array(byteString.length);
	    for (var i = 0; i < byteString.length; i++) {
	        bytes[i] = byteString.charCodeAt(i);
	    }
	    return bytes;
	}
	var namecheckKeys = {
	    'https://poppy.io/a/namecheck': 'mLSFDoakajER2ueB82T/+zDYFNJF1xonCkNspbUL4WU=',
	    'https://poppy.io/#namecheck.1804': 'Ypl5StmhX6X9TgATcaNjFgwMqwxi1Jk1cqgrkq6OQ1A='
	};
	function verifyNamecheck(resolving, keyName, signed, result) {
	    let keyBytes = bytesFromBase64(namecheckKeys[keyName]);
	    let signedBytes = bytesFromBase64(signed);
	    let tmp = new Uint8Array(signedBytes.length);
	    let mlen = crypto_sign_open(tmp, signedBytes, signedBytes.length, keyBytes);
	    if (mlen < 0)
	        return false;
	    let mByteString = '';
	    for (let b = 0; b < mlen; b++)
	        mByteString += String.fromCharCode(tmp[b]);
	    let namecheck;
	    try {
	        namecheck = JSON.parse(decodeURIComponent(escape(mByteString)));
	    } catch (e) {
	        return false;
	    }
	    if (typeof namecheck.d !== 'string')
	        return false;
	    let resolvingSegments = resolving.split('.');
	    let verifiedSegments = namecheck.d.split('.');
	    if (resolvingSegments.length !== verifiedSegments.length)
	        return false;
	    for (let i = 0; i < verifiedSegments.length; i++) {
	        let forms = verifiedSegments[i].split('|');
	        if (!forms.some(verifiedForm => verifiedForm === resolvingSegments[i]))
	            return false;
	    }
	    result.namechecked = keyName;
	    if (typeof namecheck.n === 'string')
	        result.name = namecheck.n;
	    return true;
	}

	/**
	 *
	 * @param session
	 * @param options
	 */
	function starter(dialog, matchlist) {
	    let leaving = false;
	    let popup = dialog.popup;
	    let document = popup.document;
	    let opener = dialog.opener;
	    let $ = sel => document.querySelector(sel);
	    let $$ = sel => Array.prototype.slice.call(document.querySelectorAll(sel));
	    let style = (sel, styles) => {
	        (typeof sel === 'string' ? $$(sel) : [sel]).forEach(node => {
	            for (let key in styles) {
	                node.style[key] = styles[key];
	            }
	        });
	    };
	    let state = {
	        OB: '{',
	        CB: '}',
	        clientName: dialog.opener.clientName || document.domain
	    };
	    let setState = updates => {
	        if (updates.focused && updates.focused !== state.focused) {
	            state.focused = updates.focused;
	            updates.focused.focus();
	            Promise.resolve().then(() => updates.focused.focus());
	        }
	        for (let key in updates) {
	            state[key] = updates[key];
	        }
	        style('#modal', { display: state.openModal ? 'flex' : 'none' });
	        style('#main', { opacity: state.openModal ? '0.5' : null });
	        if (state.openModal) {
	            $('#input').blur();
	            $$('.modal-body').forEach(modalBody => {
	                modalBody.style.display = modalBody.id === state.openModal.id ? 'block' : 'none';
	            });
	        }
	        let translated = key => (opener.getString(key) || key + '???').replace(/\{(\w+)\}/g, (_, s) => state[s]);
	        $$('[data-t]').forEach(el => {
	            el.textContent = translated(el.getAttribute('data-t'));
	        });
	        $('#clientName').textContent = state.clientName;
	        $('#activityTitle').textContent = document.title = opener.activityName || translated('connectPoppy');
	    };
	    document.write("<head><meta name=viewport content=\"width=device-width,initial-scale=1\"></head><body><div id=box><div id=main><div id=title><h1 id=clientName></h1><h2 id=activityTitle></h2></div><form id=theForm><div><input id=input type=text name=poppy_identifier></div><div><button data-t=go type=submit></button> <button type=button id=cancel data-t=cancel></button></div></form><div id=message><p data-t=explanation></p></div><div id=matchInfo></div><p id=version></p></div></div><div id=modal><div id=modal-box><div class=modal-body id=loading><p data-t=checking></p><div class=modal-buttons><button data-modal-action=cancel data-t=cancel></button></div></div><div class=modal-body id=found><p data-t=sendingYou></p></div><div class=modal-body id=wontWork><p><strong></strong></p><p data-t=wontWorkNowWhat></p><div class=modal-buttons><button data-modal-action=cancel id=wontWork-ok data-t=ok></button></div></div></div></div></body>");
	    applyBaseStyles(style);
	    let matchInfo = $('#matchInfo');
	    matchlist.forEach(matchOption => {
	        let matchDetail = document.createElement('div');
	        matchDetail.textContent = (matchOption.accept ? 'Accept ' : 'Offer ') + (matchOption.accept || matchOption.offer) + ' ' + (matchOption.hint && Array.isArray(matchOption.hint.types) ? matchOption.hint.types.join(', ') : '');
	        matchInfo.appendChild(matchDetail);
	    });
	    setState({ focused: $('#input') });
	    $('#theForm').addEventListener('submit', e => {
	        e.preventDefault();
	        let input = $('#input');
	        let cancelled = false;
	        let returnFocusTo = state.focused && state.focused.nodeName !== 'BUTTON' ? state.focused : input;
	        if (state.focused)
	            state.focused.blur();
	        setState({
	            search: input.value,
	            openModal: {
	                id: 'loading',
	                cancel() {
	                    cancelled = true;
	                    setState({
	                        focused: returnFocusTo,
	                        openModal: null
	                    });
	                }
	            }
	        });
	        resolveName($('#input').value).then(result => {
	            if (cancelled)
	                return;
	            setState({ openModal: { id: 'found' } });
	            leaving = true;
	            dialog.origins.push(getOrigin(result.url));
	            try {
	                dialog.popup.location.replace(result.url);
	            } catch (e) {
	                dialog.proxy.contentWindow.pio_nav(dialog.popup, result.url);
	            }
	        }).catch(error => {
	            if (cancelled)
	                return;
	            setState({
	                errorMessage: error.message,
	                focused: $('#wontWork-ok'),
	                openModal: {
	                    id: 'wontWork',
	                    cancel() {
	                        setState({
	                            errorMessage: null,
	                            focused: returnFocusTo,
	                            openModal: null
	                        });
	                    }
	                }
	            });
	        });
	    });
	    $('#cancel').addEventListener('click', e => {
	        dialog.cancel();
	    });
	    $('#version').innerText = 'poppyio ' + version;
	    document.body.addEventListener('click', e => {
	        let modalAction = e.target.getAttribute('data-modal-action');
	        if (modalAction) {
	            state.openModal[modalAction]();
	        }
	    });
	    document.body.addEventListener('keyup', e => {
	        if (e.keyCode === 27) {
	            if (state.openModal) {
	                if (typeof state.openModal.cancel === 'function') {
	                    state.openModal.cancel();
	                }
	            } else {
	                dialog.cancel();
	            }
	        }
	    });
	    document.body.addEventListener('focusin', e => {
	        state.focused = e.target;
	        setState({});
	    });
	    document.body.addEventListener('focusout', e => {
	        if (e.target === state.focused)
	            state.focused = null;
	        setState({});
	    });
	    popup.addEventListener('unload', () => {
	        if (!leaving)
	            dialog.cancel();
	    });
	}
	function applyBaseStyles(style) {
	    style('body', {
	        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
	        margin: '0',
	        backgroundColor: 'white',
	        color: 'black',
	        textAlign: 'center'
	    });
	    style('html,body', { height: '100%' });
	    style('#box', {
	        display: 'flex',
	        margin: '0',
	        flexDirection: 'column',
	        height: '100%',
	        padding: '1rem',
	        boxSizing: 'border-box'
	    });
	    style('#main', {
	        maxWidth: '40rem',
	        margin: 'auto',
	        width: '100%'
	    });
	    style('h1, h2', {
	        fontSize: '1rem',
	        margin: '0'
	    });
	    style('h1', { fontWeight: 'normal' });
	    style('h2', {
	        marginBottom: '0.2rem',
	        fontSize: '1.5rem'
	    });
	    style('#theForm', { display: 'block' });
	    style('#input', { width: '100%' });
	    style('#theForm button', {
	        width: '6rem',
	        margin: '0.5rem'
	    });
	    style('#modal', {
	        position: 'absolute',
	        left: '0',
	        top: '0',
	        width: '100%',
	        height: '100%',
	        flexDirection: 'column'
	    });
	    style('#modal-box', {
	        backgroundColor: 'white',
	        maxWidth: '30rem',
	        margin: 'auto',
	        padding: '1rem 2rem',
	        border: 'solid 1px #aaaaaa',
	        borderRadius: '0.3rem',
	        boxShadow: '0.2rem 0.2rem 0.2rem #dddddd'
	    });
	    style('.modal-buttons', { textAlign: 'center' });
	    style('.modal-buttons button', { width: '10rem' });
	    style('#matchInfo, #version', { fontSize: '0.7rem' });
	}

	let base = Poppy.any();
	base.strings.push(strings);
	base.launcher = starter;

	const nodes = {
		output: document.querySelector("#output"),
		original: document.querySelector("#original"),
		steps: document.querySelector("#steps"),
		raster: document.querySelector("#raster"),
		vector: document.querySelector("#vector"),
		vectorText: document.querySelector("#vector-text"),
		types: Array.from(document.querySelectorAll("#output [name=type]"))
	};

	let steps;

	function go(original, cfg) {

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
		};
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
		let cfg = getConfig();
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

	function init$1() {
		nodes.output.style.display = "none";
		nodes.types.forEach(input => input.addEventListener("click", syncType));
		init();
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

	init$1();

}());
