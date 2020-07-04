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

	function asSchemeArray(schemes) {
	    if (isValue(schemes)) {
	        let schemeArray = arrayify(schemes);
	        for (let scheme of schemeArray) {
	            if (typeof scheme !== 'string') {
	                raise('SchemeNotAString');
	            }
	        }
	        return schemeArray;
	    }
	    return undefined;
	}
	function asSendableConnectorList(connectors) {
	    let roleDefinitions = {};
	    let specs = connectors.map(connector => {
	        if (!isValue(connector)) {
	            //so: If the connector is not an object, an Error is thrown
	            raise('ConnectorNotAnObject');
	        }
	        let accepting = asSchemeArray(connector.accepting);
	        let offering = asSchemeArray(connector.offering);
	        if (accepting && offering) {
	            raise('ConnectorBothOfferingAndAccepting');
	        }
	        if (!accepting && !offering) {
	            raise('ConnectorHasNeitherOfferingNorAccepting');
	        }
	        for (let scheme of accepting || []) {
	            if (roleDefinitions['+' + scheme]) {
	                raise('SchemeInMultiplePlaces');
	            }
	            roleDefinitions[0 + scheme] = 1;
	        }
	        for (let scheme of offering || []) {
	            if (roleDefinitions['-' + scheme]) {
	                raise('SchemeInMultiplePlaces');
	            }
	            roleDefinitions[1 + scheme] = 1;
	        }
	        if (offering) {
	            if (!isValue(connector.deliver)) {
	                //so: If the connector is offering but doesn't have a "deliver" value or function, an Error is thrown.
	                raise('OfferingValueOrFunctionMissing');
	            }
	        }
	        else {
	            let handle = connector.handle;
	            if (isValue(handle) && !isFunction(handle)) {
	                //so: If the connector is accepting and has the optional "handle" property, but the "handle" property isn't a function, an Error is thrown.
	                raise('AcceptingHandleMustBeAFunction');
	            }
	        }
	        return {
	            accepting,
	            offering,
	            having: connector.having
	        };
	    });
	    if (specs.length === 0) {
	        //so: If there are no connectors in the connector list, an Error is thrown.
	        raise('NoConnectors');
	    }
	    return specs;
	}
	function getOrigin(url, relativeTo) {
	    let match = url.match(/^[A-Za-z\+\.\-]+\:\/\/[^/]+/);
	    if (!match) {
	        if (relativeTo)
	            return getOrigin(relativeTo);
	        return '';
	    }
	    else {
	        return match[0];
	    }
	}
	function cleanPeerConnectorList(rawPeerConnectorList) {
	    // TODO: dedup
	    if (!Array.isArray(rawPeerConnectorList)) {
	        raise('PeerConnectorListNotAnArray');
	    }
	    let uniqueness = {};
	    let validateSchemes = (schemes, side) => {
	        if (Array.isArray(schemes)) {
	            let schemeArray = schemes.filter((value) => typeof value === 'string' && value);
	            for (let scheme of schemeArray) {
	                let key = side + scheme;
	                if (uniqueness[key]) {
	                    raise('PeerConnectorHasDuplicateScheme');
	                }
	                uniqueness[key] = 1;
	            }
	            return schemeArray;
	        }
	        return undefined;
	    };
	    return rawPeerConnectorList.map((connector) => {
	        if (!connector)
	            raise('PeerConnectorNotValid');
	        let accepting = validateSchemes(connector.accepting, '-');
	        let offering = validateSchemes(connector.offering, '+');
	        if (accepting && offering) {
	            raise('PeerConnectorNotValid');
	        }
	        if (!accepting && !offering) {
	            raise('PeerConnectorNotValid');
	        }
	        return {
	            accepting,
	            offering,
	            having: connector.having
	        };
	    });
	}
	function match(connectors, peerConnectors, origin) {
	    for (let connector of connectors) {
	        let ourSide = arrayify(connector.accepting || connector.offering);
	        for (let peerConnector of peerConnectors) {
	            let theirSide = connector.accepting ? peerConnector.offering : peerConnector.accepting;
	            if (!theirSide)
	                continue;
	            for (let ourScheme of ourSide) {
	                if (theirSide.indexOf(ourScheme) < 0)
	                    continue;
	                return [
	                    connector,
	                    {
	                        origin,
	                        connectors: peerConnectors,
	                        matched: peerConnector
	                    }
	                ];
	            }
	        }
	    }
	    //so: When matching, if no local connectors can match a peer connector, an error is thrown.
	    raise('NoMatchingConnector');
	}
	function performConnect(result, connectors, origin, peerConnectors, port, closed) {
	    //so: When establshing a connection, the a local connector is matched with a peer connector.
	    let [connector, peer] = match(connectors, peerConnectors, origin);
	    result.connected = connector;
	    result.peer = peer;
	    if ('deliver' in connector) {
	        //so: If the matched local connector is "offering", we assume the "offering" role
	        return performOffer(result, connector, peer, port, closed);
	    }
	    else {
	        //so: If the matched local connector is "accepting", we assume the "accepting" role
	        return performAccept(result, connector, peer, port, closed);
	    }
	}
	function performOffer(connectResult, connector, peer, port, closed) {
	    let promise = new Promise((resolve, reject) => {
	        let waitingForResult = true;
	        let waitingForOffer = true;
	        let finishIfDone = () => {
	            if (waitingForResult || waitingForOffer) {
	                return;
	            }
	            //so: Once the offer message is sent and result message recieved, post release message and resolve the performOffer promise
	            port.postMessage(['release']);
	            resolve(connectResult);
	        };
	        closed.then(() => {
	            //so: If the request is closed after , the offer function resolved
	            resolve(connectResult);
	        });
	        port.onmessage = (ev) => {
	            try {
	                if (ev.data && ev.data[0] === 'result') {
	                    if (waitingForResult) {
	                        waitingForResult = false;
	                        connectResult.offer = arrayify(ev.data[1]);
	                    }
	                }
	                finishIfDone();
	            }
	            catch (e) {
	                reject(e);
	            }
	        };
	        let offerPosted = false;
	        let peerAcceptor = {
	            peer,
	            closed,
	            postOffer(offer, transferList) {
	                if (offerPosted) {
	                    //so: If PoppyPeerAcceptor.postOffer() is called more than once an error is thrown
	                    return Promise.reject(getError('OfferAlreadyPosted'));
	                }
	                //so: PoppyPeerAcceptor.postOffer() sends the offer message to the accepting peer
	                port.postMessage(['offer', offer], transferList || []);
	                waitingForOffer = false;
	                finishIfDone();
	                return promise;
	            }
	        };
	        if (isFunction(connector.deliver)) {
	            //so: If the deliver property is a function, pass it with a PoppyPeerAcceptor
	            let result = connector.deliver(peerAcceptor);
	            if (result && isFunction(result.then)) {
	                //so: If the deliver function returns a promise, cancel the request if it rejects
	                result.then(undefined, reject);
	            }
	        }
	        else {
	            //so: If the deliver property is not a function, resolve it if is a promise and post it as the offer.
	            Promise.resolve(connector.deliver).then(data => {
	                peerAcceptor.postOffer(data);
	            }, reject);
	        }
	    });
	    return promise;
	}
	function performAccept(connectResult, connector, peer, port, closed) {
	    let offer = {
	        peer,
	        closed,
	        items: []
	    };
	    let promise = new Promise((resolve, reject) => {
	        let rejected = false;
	        let waitingForOffer = true;
	        let waitingForRelease = true;
	        let waitingForResult = true;
	        closed.then(() => {
	            if (waitingForOffer) {
	                //so: If the request is closed before an offer is recieved, the accept function is rejected.
	                reject(getError('ClosedBeforeOffer'));
	                rejected = true;
	            }
	            else {
	                //so: If the request is closed after an offer is recieved, the accept function is resolved.
	                resolve(connectResult);
	            }
	        });
	        let resolveIfDone = () => {
	            if (!waitingForRelease && !waitingForResult) {
	                //so: Once a resoltion is sent and a release is recieved, resolve the connection
	                resolve(connectResult);
	            }
	        };
	        port.onmessage = ev => {
	            try {
	                if (rejected) {
	                    //so: After the promise is rejected all further messages are ignored
	                    return;
	                }
	                switch (ev.data && ev.data[0]) {
	                    case 'offer':
	                        if (waitingForOffer) {
	                            waitingForOffer = false;
	                            //so: When an offer message is recieved it is accepted
	                            acceptOffer(ev, offer, connector);
	                        }
	                        else {
	                            //so: If more than one offer message is recieved the connection is canceled.
	                            raise('OfferAlreadyRecieved');
	                        }
	                        break;
	                    case 'release':
	                        waitingForRelease = false;
	                        break;
	                    default:
	                        //so: If an unrecognized message is recieved on the connect channel when accepting the connection is canceled.
	                        raise('UnknownConnectChannelMessage');
	                }
	                resolveIfDone();
	            }
	            catch (e) {
	                //so: When accepting, if there is an exception in the handle process, the request will be cancelled.
	                reject(e);
	            }
	        };
	        offer.postResult = (result, transfer) => {
	            try {
	                //so: When accepting, postResult ends the request
	                if (!waitingForResult) {
	                    //so: If PoppyPeerOffer.postResult is called more than once an error is thrown
	                    raise('ResultAlreadyPosted');
	                }
	                waitingForResult = false;
	                //so: When accepting, postResult sends a result message back to the offering peer
	                port.postMessage(['result', result], transfer || []);
	                connectResult.result = arrayify(result);
	                resolveIfDone();
	            }
	            catch (e) {
	                reject(e);
	            }
	            return promise;
	        };
	        let acceptOffer = (ev, offer, connector) => {
	            offer.ports = ev.ports;
	            connectResult.offer = offer.data = arrayify(ev.data[1]);
	            if (!isFunction(connector.handle)) {
	                //so: When accepting, If no handle function is present in the acceptor, the request is immediately resolved.
	                offer.postResult();
	                return;
	            }
	            let handleResult = connector.handle(offer);
	            if (handleResult && isFunction(handleResult.then)) {
	                //so: When accepting, If the handler function is asynchronous or returns a promise, then if it rejects the request will be cancelled.
	                handleResult.then(undefined, reject);
	            }
	        };
	    });
	    return promise;
	}
	function arrayify(thing) {
	    return [].concat(thing).filter(isValue);
	}
	function raise(code) {
	    throw getError(code);
	}
	function getError(code) {
	    let error = new Error('https://what.poppy.io/error/' + code);
	    error.name = 'poppyio.' + code;
	    return error;
	}
	function isValue(value) {
	    return value !== null && !isType(value, 'undefined');
	}
	function isFunction(value) {
	    return isType(value, 'function');
	}
	function isType(value, type) {
	    return typeof value === type;
	}

	class PoppyClient {
	    constructor() {
	        //so: [[PoppyClient]] is the entrypoint for Poppy I/O client applications
	    }
	    createRequest(properties) {
	        //so: PoppyClient.createRequest() creates a new request
	        let internalRequest = internalCreateRequest(this, properties || {});
	        return internalRequest./*externalObject*/_0 = {
	            cancel: internalRequest./*close*/_1.bind(internalRequest),
	            open: internalRequest./*open*/_2.bind(internalRequest),
	            connect: internalRequest./*connect*/_3.bind(internalRequest),
	            closed: internalRequest./*closed*/_4,
	            properties: properties || {},
	            origins: [getOrigin(location.href)],
	            get status() {
	                return internalRequest./*status*/_5;
	            }
	        };
	    }
	}
	function internalCreateRequest(client, properties) {
	    let finalizers = [];
	    return {
	        /*finalizers*/_6: finalizers,
	        /*status*/_5: 'unopened',
	        /*closed*/_4: new Promise(resolve => finalizers.push(resolve)),
	        /*properties*/_7: properties,
	        /*client*/_8: client,
	        /*result*/_9: {
	            offer: [],
	            result: []
	        },
	        /*close*/_1: closeRequest,
	        /*open*/_2: openRequest,
	        /*connect*/_3: connectRequest,
	        /*defer*/_a: finalizer => finalizers.push(finalizer),
	        /*onProxyCrossDocumentMessage*/_b: onProxyCrossDocumentMessage,
	        /*onMatchChannelMessage*/_c: onMatchChannelMessage,
	        /*onConnectPeer*/_d: onConnectPeer,
	    };
	}
	function closeRequest() {
	    //so: PoppyClientRequest.cancel() closes the request
	    if (this./*status*/_5 === 'closed') {
	        //so: PoppyClientRequest.cancel() has no effect after the request is already closed
	        return;
	    }
	    //so: Closing the PoppyClientRequest puts it into "closed" state.
	    this./*status*/_5 = 'closed';
	    this./*finalizers*/_6.reverse();
	    for (let finalizer of this./*finalizers*/_6) {
	        try {
	            finalizer();
	        }
	        catch (e) {
	            console.error('https://what.poppy.io/caughtErrorClosingRequest', e);
	        }
	    }
	}
	function openRequest() {
	    //so: PoppyClientRequest.open opens a request without initiating a connection
	    try {
	        if (this./*status*/_5 === 'closed') {
	            //so: Attempting to open a PoppyClientRequest after it is closed will throw an Error
	            raise('openAfterClosed');
	        }
	        if (this./*status*/_5 !== 'unopened') {
	            //so: Opening a request that is open, connecting, or connected has no effect.
	            return;
	        }
	        //so: PoppyClientRequest.open puts the request into "open" state
	        this./*status*/_5 = 'open';
	        //so: When the page is unloaded, the PoppyClientRequest is canceled
	        let close = this./*close*/_1.bind(this);
	        window.addEventListener('unload', close);
	        this./*defer*/_a(() => {
	            //so: When the request is closed, the unload listener is cleaned up.
	            window.removeEventListener('unload', close);
	        });
	        //so: Opening a PoppyClientRequest sets it as the current modal request
	        setCurrentRequest(this./*externalObject*/_0, this./*finalizers*/_6);
	        //so: Opening a PoppyClientRequest inserts a hidden proxy iframe into the page
	        let proxy = this./*proxy*/_e = insertProxyIframe(this./*properties*/_7, this./*defer*/_a);
	        //so: Opening a PoppyClientRequest enables the modal overlay configured on the PoppyClient
	        showOverlay(this./*client*/_8, this./*externalObject*/_0, this./*close*/_1.bind(this), this./*defer*/_a);
	        //so: Opening a PoppyClientRequest opens the poppy dialog window.
	        this./*popup*/_f = openPopup(this./*client*/_8, this./*externalObject*/_0, proxy, this./*defer*/_a);
	    }
	    catch (e) {
	        //so: If an Error is thrown while opening a PoppyClientRequest it will be closed. 
	        this./*close*/_1();
	        throw e;
	    }
	}
	function insertProxyIframe(properties, defer) {
	    defer(() => {
	        //so: When the PoppyClientRequest is closed the proxy iframe is removed from the page.
	        if (proxy.parentNode)
	            proxy.parentNode.removeChild(proxy);
	    });
	    let proxy = document.createElement('iframe');
	    //so: The PoppyClientRequest proxy is inserted at the end of the body
	    //so: The PoppyClientRequest proxy has permissions "allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-modals"
	    let sandboxPermissions = 'allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-modals';
	    proxy.style.display = 'none';
	    try {
	        proxy.sandbox.value = sandboxPermissions;
	    }
	    catch (e) {
	        // for some older browsers including UC Browser
	        proxy.sandbox = sandboxPermissions;
	    }
	    document.body.appendChild(proxy);
	    return proxy;
	}
	function showOverlay(client, request, cancel, defer) {
	    const overlay = client.overlay;
	    if (typeof overlay === 'function') {
	        //so: If PoppyClient.overlay is a function it is called when the request is opened.
	        let hideOverlay = overlay(request);
	        defer(() => {
	            //so: When the PoppyClientRequest is closed the finalizer function returned by the PoppyClient.overlay function is called
	            hideOverlay();
	        });
	    }
	    else if (overlay) {
	        //so: If PoppyClient.overlay is an HTML element it is made visible by setting CSS display:block when the request is opened.
	        overlay.style.display = 'block';
	        defer(() => {
	            //so: When the PoppyClientReqeust is closed the PoppyClient.overlay HTML element is hidden by setting CSS display:none
	            overlay.style.display = 'none';
	        });
	    }
	    else {
	        //so: If no PoppyClient.overlay is specified a default overlay will be created
	        //so: The default overlay is black with a 50% opacity
	        //so: The default overlay is inserted at the end of the body
	        let defaultOverlay = document.createElement('div');
	        defaultOverlay.style.position = 'fixed';
	        defaultOverlay.style.top = defaultOverlay.style.left = '0';
	        defaultOverlay.style.width = defaultOverlay.style.height = '100%';
	        defaultOverlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
	        defaultOverlay.addEventListener('click', () => {
	            //so: If the user clicks anywhere on the default overlay the request will be canceled
	            cancel();
	        });
	        document.body.appendChild(defaultOverlay);
	        defer(() => {
	            //so: When the PoppyClientRequest is closed the default overlay will be removed from the page.
	            defaultOverlay.parentNode.removeChild(defaultOverlay);
	        });
	    }
	}
	function openPopup(client, request, proxy, defer) {
	    let proxyWindow = proxy.contentWindow;
	    //so: PoppyClientRequest.open opens a poppy dialog
	    const popup = proxyWindow.open('about:blank', undefined, `scrollbars=1,resizable=1,`
	        + `width=${window.outerWidth - 100},`
	        + `height=${window.outerHeight - 120},`
	        + `left=${window.screenX + 40},`
	        + `top=${window.screenY + 40}`);
	    if (!popup) {
	        //so: If the popup is blocked, PoppyClientRequest.open will throw an Error
	        raise('popupBlocked');
	    }
	    let pollInterval = window.setInterval(() => {
	        if (popup.closed) {
	            //so: If the popup is closed, the PoppyClientRequest will be canceled
	            window.clearInterval(pollInterval);
	            request.cancel();
	        }
	    }, 100);
	    defer(() => {
	        //so: When a PoppyClientRequest is closed, the poppy dialog is closed
	        try {
	            popup.close();
	        }
	        catch (e1) {
	            try {
	                proxyWindow.pioClose(popup);
	            }
	            catch (e2) {
	                console.error('https://what.poppy.io/failedToClosePopup', e1, e2);
	            }
	        }
	        window.clearInterval(pollInterval);
	    });
	    proxyWindow.pioNav = (popup, url) => popup.location.replace(url);
	    proxyWindow.pioClose = (popup) => popup.close();
	    if (!client.noInlineScripts) {
	        //so: If PoppyClient.noInlineScripts is not true, an inline script element is inserted into the proxy iframe
	        proxyWindow.document.write('<script>' +
	            'function pioClose(w){w.close()};' +
	            'function pioNav(w,u){w.location.replace(u)}' +
	            '</script>');
	    }
	    if (client.prelaunch) {
	        //so: If a PoppyClient.prelaunch function is specified, it will be applied to the poppy dialog after being opened
	        client.prelaunch(popup);
	    }
	    return popup;
	}
	function setCurrentRequest(request, finalizers) {
	    if (PoppyClient.currentRequest && PoppyClient.currentRequest !== request) {
	        //so: Opening a PoppyClientRequest closes the previous request.
	        PoppyClient.currentRequest.cancel();
	    }
	    PoppyClient.currentRequest = request;
	    finalizers.push(() => {
	        //so: When the PoppyClientRequest is closed it is unset as the PoppyClient.currentRequest
	        if (PoppyClient.currentRequest === request)
	            PoppyClient.currentRequest = undefined;
	    });
	}
	function connectRequest(connectors) {
	    //so: PoppyClientRequest.connect() initiates a connection
	    return new Promise((resolve, reject) => {
	        //so: PoppyClientRequest.connect() implicitly opens the request
	        this./*open*/_2();
	        if (this./*status*/_5 !== 'open') {
	            //so: PoppyClientRequest.connect() will throw an Error if called more than once or after a request is closed.
	            raise('connectWhenNotConnectable');
	        }
	        // PoppyClientRequest.connect() puts the request into "connecting" state
	        this./*status*/_5 = 'connecting';
	        this./*rejectConnect*/_g = reject;
	        let connectorArray = this./*connectors*/_h = arrayify(connectors);
	        let proxyWindow = this./*proxy*/_e.contentWindow;
	        let target;
	        if (this./*properties*/_7.serviceUrl) {
	            //so: If a serviceUrl is specified in the request options, connecting will load that page directly.
	            target = this./*properties*/_7.serviceUrl;
	        }
	        else if (typeof this./*client*/_8.launch === 'string') {
	            //so: If PoppyClient.launch is a string, it will be used as the URL of the launch page.
	            target = this./*client*/_8.launch;
	        }
	        if (target) {
	            //so: If a launch URL or serviceUrl is specified, the origin of that URL is authorized to connect
	            this./*externalObject*/_0.origins.push(getOrigin(target, location.href));
	            proxyWindow.pioNav(this./*popup*/_f, target);
	        }
	        else if (typeof this./*client*/_8.launch === 'function') {
	            //so: If PoppyClient.launch is a function, it will be applied to the window when connecting 
	            this./*client*/_8.launch(this./*popup*/_f, this./*externalObject*/_0, connectorArray);
	        }
	        else {
	            //so: If no serviceUrl is specified and no PoppyClient.launch is configured connect will throw an Error.
	            raise('https://what.poppy.io/connectWithNoServiceUrlOrLauncher');
	        }
	        //so: PoppyClientRequest waits for a message indicating a service is listening posted to the proxy window.
	        proxyWindow.addEventListener('message', ev => {
	            try {
	                this./*onProxyCrossDocumentMessage*/_b(this, ev);
	            }
	            catch (e) {
	                reject(e);
	            }
	        });
	        // This is at the very end so that if there is an exception anywhere above
	        // this, the promise rejects instead of resolving.
	        this./*finalizers*/_6.push(() => {
	            //so: Closing the request resolve the connect() promise
	            resolve(this./*result*/_9);
	        });
	    }).catch(reason => {
	        //so: If PoppyClientRequest.connect() throws an Error, the request is closed
	        this./*close*/_1();
	        return Promise.reject(reason);
	    });
	}
	//test-export: handleConnectRequest
	function onProxyCrossDocumentMessage(request, ev) {
	    let source = ev.source;
	    let origin = ev.origin;
	    if (request./*externalObject*/_0.origins.indexOf(ev.origin) < 0) {
	        //so: If a proxy message is not from a trusted origin it is ignored
	        console.warn('got message from unauthorized origin', ev.origin);
	        return;
	    }
	    let message = ev.data && (ev.data['https://poppy.io/a/to-client'] || ev.data['https://what.poppy.io/toClient']);
	    if (!message) {
	        //so: If a proxy message isn't addressed to the client it's ignored
	        console.warn('unrecognized message', ev.data);
	        return;
	    }
	    if (message.close) {
	        //so: A "close" proxy message cancels the request
	        request./*close*/_1();
	        return;
	    }
	    if (Array.isArray(message.origins)) {
	        //so: An "origins" proxy message replaces the set of authorized origins
	        request./*externalObject*/_0.origins = message.origins.filter((origin) => typeof origin === 'string');
	    }
	    if (!message.listen)
	        return;
	    //so: A "listen" message indicates a service is listening for a request.
	    if (request./*status*/_5 === 'connected') {
	        //so: If a "listen" message was recieved after a connection was established an "expired" message is send back to the service
	        source.postMessage({
	            'https://poppy.io/a/to-host': {
	                expired: true
	            },
	            'https://what.poppy.io/fromClient': {
	                expired: true
	            }
	        }, ev.origin);
	        return;
	    }
	    //so: In reply to a listen proxy message, the service is sent a "request" message with the request options, connector list, and "connect" port.
	    let matchChannel = new MessageChannel;
	    source.postMessage({
	        'https://poppy.io/a/to-host': {
	            request: asSendableConnectorList(request./*connectors*/_h),
	            properties: request./*properties*/_7
	        }
	    }, ev.origin, [matchChannel.port1]);
	    if (request./*matchPort*/_i) {
	        request./*matchPort*/_i.postMessage(['invalidated']);
	        request./*matchPort*/_i.close();
	    }
	    request./*matchPort*/_i = matchChannel.port2;
	    //so: The client listens for a request to connect on the connect port.
	    request./*matchPort*/_i.onmessage = ev => {
	        try {
	            request./*onMatchChannelMessage*/_c(request, origin, ev);
	        }
	        catch (e) {
	            request./*rejectConnect*/_g(e);
	        }
	    };
	}
	function onMatchChannelMessage(request, origin, ev) {
	    switch (ev.data && ev.data[0]) {
	        case 'close':
	            //so: A close message on the match channel cancels the request
	            request./*close*/_1();
	            return;
	        case 'origins':
	            if (!Array.isArray(ev.data[1])) {
	                //so: An invalid "origins" match channel message cancels the connection.
	                raise('invalidMatchChannelMessage');
	            }
	            //so: An "origins" match channel message replaces the set of authorized origins
	            request./*externalObject*/_0.origins = ev.data.origins.filter((origin) => typeof origin === 'string');
	            return;
	        case 'connect':
	            //so: A "connect" match channel message initiates a connection
	            break;
	        default:
	            //so: An unrecognized message cancels the connection
	            raise('invalidMatchChannelMessage');
	    }
	    if (request./*status*/_5 === 'connected') {
	        //so: If a connect is attempted after a connection is already established the connection is canceled.
	        raise('alreadyConnected');
	    }
	    //so: When a connect message is received the request goes into "connected" state.
	    request./*status*/_5 = 'connected';
	    //so: The peer connecter is validated
	    let peerConnectors = cleanPeerConnectorList([ev.data[1]]);
	    if (ev.ports.length !== 1) {
	        //so: If there is not exactly one MessagePort provided with the "connect" message an Error is thrown.
	        raise('connectMessageInvalid');
	    }
	    let port = ev.ports[0];
	    //so: If the "connect" message is valid the peer is matched with a connector provided to PoppyClientRequest.connect() to establish a connection
	    request./*onConnectPeer*/_d(request, peerConnectors, origin, port);
	}
	function onConnectPeer(request, peerConnectors, origin, port) {
	    performConnect(request./*result*/_9, request./*connectors*/_h, origin, peerConnectors, port, request./*closed*/_4).then(undefined, request./*rejectConnect*/_g);
	}

	//import { crypto_sign_open } from './nacl/crypto_sign_open';
	/**
	 * Create an XMLHttpRequest to retrieve a host-meta from the standard well-known
	 * location.
	 *
	 * @param domain domain to get host-meta for
	 */
	function openWellKnownHostMetaRequest(domain) {
	    let req = new XMLHttpRequest;
	    req.open('GET', 'https://' + domain + '/.well-known/host-meta.json');
	    return req;
	}
	/**
	 * Resolve a domain to a poppy service URL. Resolves if successful, rejects
	 * if the domain is unable to be resolved.
	 *
	 * @param domain
	 * 	  domain name to resolve
	 * @param openHostMetaRequest
	 * 	  optional function that creates an XMLHttpRequest
	 *    to retrieve the host-meta from a nonstandard location (for testing)
	 */
	function discover(domain, openHostMetaRequest) {
	    return new Promise((resolve, reject) => {
	        domain = (domain || '').trim().toLowerCase();
	        if (!domain) {
	            return reject(Error('Poppy.io: no-domain'));
	        }
	        if (typeof domain.normalize === 'function') {
	            domain = domain.normalize('NFKC');
	        }
	        let req = (openHostMetaRequest || openWellKnownHostMetaRequest)(domain);
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
	                    if (hostMeta.properties) {
	                        for (let keyName in namecheckKeys) {
	                            if (typeof hostMeta.properties[keyName] !== 'string')
	                                continue;
	                            if (verifyNamecheck(domain, keyName, hostMeta.properties[keyName], result)) {
	                                break;
	                            }
	                        }
	                    }
	                    return resolve(result);
	                }
	                return reject(Error('Poppy.io: no-dialog-found'));
	            }
	            catch (e) {
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
	var namecheckKeys = {
	    "https://poppy.io/a/namecheck": "mLSFDoakajER2ueB82T/+zDYFNJF1xonCkNspbUL4WU=",
	    "https://poppy.io/#namecheck.1804": "Ypl5StmhX6X9TgATcaNjFgwMqwxi1Jk1cqgrkq6OQ1A=",
	    "https://poppy.io/#namecheck.1806": "24rYF+c6pBZQjuvQZpfNPNgXPZAFoRcqWODEBtTQjhE="
	};
	function verifyNamecheck(resolving, keyName, signed, result) {
	    return false;
	    // let keyBytes = bytesFromBase64(namecheckKeys[keyName]);
	    // let signedBytes = bytesFromBase64(signed);
	    // let tmp = new Uint8Array(signedBytes.length);
	    // let mlen = crypto_sign_open(tmp, signedBytes, signedBytes.length, keyBytes);
	    // if (mlen < 0) return false;
	    // let mByteString = '';
	    // for (let b = 0; b < mlen; b++) mByteString += String.fromCharCode(tmp[b]);
	    // let namecheck: any;
	    // try {
	    // 	namecheck = JSON.parse(decodeURIComponent(escape(mByteString)));
	    // } catch (e) {
	    // 	return false;
	    // }
	    // if (typeof namecheck.d !== 'string') return false;
	    // let resolvingSegments = resolving.split('.');
	    // let verifiedSegments: string[] = namecheck.d.split('.');
	    // if (resolvingSegments.length !== verifiedSegments.length) return false;
	    // for (let i = 0; i < verifiedSegments.length; i++) {
	    // 	let forms = verifiedSegments[i].split('|');
	    // 	if (!forms.some(verifiedForm => verifiedForm === resolvingSegments[i])) return false;
	    // }
	    // result.namechecked = keyName;
	    // if (typeof namecheck.n === 'string') result.name = namecheck.n;
	    // return true;
	}

	function getVersion() { return "0.0.10-20200704224241660.whoremongeries"; }

	function writeBasicLauncherHtml(document) { document.write("<!DOCTYPE HTML><html><head><meta name=viewport content=\"width=device-width,initial-scale=1\"></head><body><div id=box><div id=main><div id=title><h1 id=clientName></h1><h2 id=activityTitle></h2></div><form id=theForm><div><input id=input type=text name=poppy_identifier></div><div><button data-t=go type=submit></button> <button type=button id=cancel data-t=cancel></button></div></form><div id=message><p data-t=explanation></p></div><div id=ood data-t=outOfDate></div><div id=version></div><div id=matchInfo></div></div></div><div id=modal><div id=modal-box><div class=modal-body id=loading><p data-t=checking></p><div class=modal-buttons><button data-modal-action=cancel data-t=cancel></button></div></div><div class=modal-body id=found><p data-t=sendingYou></p></div><div class=modal-body id=wontWork><p><strong></strong></p><p data-t=wontWorkNowWhat></p><div class=modal-buttons><button data-modal-action=cancel id=wontWork-ok data-t=ok></button></div></div></div></div></body></html>"); }

	class BasicLauncher {
	    static install(translation) {
	        (BasicLauncher.strings = BasicLauncher.strings || []).push(translation);
	        PoppyClient.prototype.launch = launch;
	    }
	}
	function launch(popup, request, connectors) {
	    let requestProperties = request.properties || {};
	    let leaving = false;
	    let document = popup.document;
	    let $ = (sel) => document.querySelector(sel);
	    let $$ = (sel) => Array.prototype.slice.call(document.querySelectorAll(sel));
	    let style = (sel, styles) => {
	        $$(sel).forEach(node => {
	            for (let key in styles) {
	                node.style[key] = styles[key];
	            }
	        });
	    };
	    let state = {
	        clientName: requestProperties.clientName || window.document.title || document.domain,
	        prompt: requestProperties.prompt
	    };
	    let setState = (updates) => {
	        if (updates.focused && updates.focused !== state.focused) {
	            state.focused = updates.focused;
	            updates.focused.focus();
	            Promise.resolve().then(() => updates.focused.focus());
	        }
	        for (let key in updates) {
	            state[key] = updates[key];
	        }
	        style('#modal', {
	            display: state.openModal ? 'flex' : 'none'
	        });
	        style('#main', {
	            opacity: state.openModal ? '0.5' : '1.0'
	        });
	        if (state.openModal) {
	            $('#input').blur();
	            $$('.modal-body').forEach(modalBody => {
	                modalBody.style.display = modalBody.id === state.openModal.id ? 'block' : 'none';
	            });
	        }
	        let strings = getStrings(BasicLauncher.strings, request.properties);
	        let translated = (key) => (strings[key] || key + '???')
	            .replace(/\{(\w+)\}/g, (_, s) => state[s]);
	        $$('[data-t]').forEach(el => {
	            el.textContent = translated(el.getAttribute('data-t'));
	        });
	        $('#clientName').textContent = state.clientName;
	        $('#activityTitle').textContent = document.title = state.prompt || translated('connectPoppy');
	    };
	    writeBasicLauncherHtml(document);
	    applyBaseStyles(style);
	    let matchInfo = $('#matchInfo');
	    connectors.forEach(connector => {
	        let matchDetail = document.createElement('div');
	        matchDetail.textContent = (connector.accepting ? 'Accept ' : 'Offer ') + (connector.accepting || connector.offering) + ' '
	            + (connector.having && Array.isArray(connector.having.contentType) ? connector.having.contentType.join(', ') : '');
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
	        discover($('#input').value).then(result => {
	            if (cancelled)
	                return;
	            setState({
	                openModal: {
	                    id: 'found'
	                }
	            });
	            leaving = true;
	            request.origins.push(getOrigin(result.url));
	            try {
	                popup.location.replace(result.url);
	            }
	            catch (e) {
	                popup.opener.pioNav(popup, result.url);
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
	        request.cancel();
	    });
	    let version = getVersion();
	    let datePattern = version.match(/^\d+\.(\d\d)(\d\d)\./);
	    if (datePattern) {
	        if (BasicLauncher.outOfDate !== 'never') {
	            let now = new Date();
	            if (BasicLauncher.outOfDate === 'always' || (parseInt(datePattern[1]) + 2000) * 12 + parseInt(datePattern[2]) < (now.getFullYear() * 12 + now.getMonth() - 2)) {
	                $('#ood').style.display = 'block';
	            }
	        }
	        $('#version').innerText = 'v. 20' + datePattern[1] + '-' + datePattern[2] + ' (' + version + ')';
	    }
	    else {
	        $('#version').innerText = 'v. ' + version;
	    }
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
	            }
	            else {
	                request.cancel();
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
	            request.cancel();
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
	    style('html,body', {
	        height: '100%'
	    });
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
	    style('h1,h2', {
	        fontSize: '1rem',
	        margin: '0'
	    });
	    style('h1', {
	        fontWeight: 'normal'
	    });
	    style('h2', {
	        marginBottom: '0.2rem',
	        fontSize: '1.5rem'
	    });
	    style('#theForm', {
	        display: 'block'
	    });
	    style('#input', {
	        width: '100%'
	    });
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
	    style('.modal-buttons', {
	        textAlign: 'center'
	    });
	    style('.modal-buttons button', {
	        width: '10rem'
	    });
	    style('#matchInfo,#version', {
	        fontSize: '0.7rem'
	    });
	    style('#ood', {
	        display: 'none',
	        fontWeight: 'bold'
	    });
	}
	function getStrings(strings, requestOptions) {
	    if (!strings)
	        throw new Error('https://what.poppy.io/noStringsInstalledForBasicLauncher');
	    return strings[0];
	}

	BasicLauncher.install({"lang":"en","langName":"English","connectPoppy":"Connect Poppy","explanation":"Enter a poppy keyword or domain name to continue.","checking":"Checking if {search} will work...","sendingYou":"Sending you to {search}...","wontWork":"It looks like {search} won't work.","wontWorkNowWhat":"{search} doesn't appear to offer a poppy. However it's possible that you\ntyped in the name incorrectly.","ok":"OK","go":"Go","cancel":"Cancel","outOfDate":"Warning: This version of Poppy I/O might be out of date."});

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
			};
		} catch (e) {
			console.error(e);
			alert('Error: ' + e.message);
		}
	}

	function onSubmit(e) {
		e.preventDefault();
		let cfg = getConfig();
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
						blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
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
