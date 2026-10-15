let globalStorage = {
	apiKey: "",
	country: "International",
	religion: "Not Specified",
	language: "en-US",
	seed: 0,
	temperature: 0.3
};

async function save(e) {
 e.preventDefault();
 const apiKey = document.getElementById("apiKey").value.trim();
 const msg = document.getElementById("errorMessage");
 const button = document.getElementById("btn");
 button.disabled = true;
 try {
  if (!apiKey) throw new Error("Enter your Cohere API key.");
  const result = await CohereAPI.request('/v1/check-api-key', apiKey, { body: {} });
  if (!result.valid) throw new Error("Invalid Cohere API key.");
  await chrome.storage.local.set({ apiKey });
  globalStorage.apiKey = apiKey;
  CohereAPI.reset();
  msg.classList.add("hidden");
  await load();
 } catch (error) {
  msg.textContent = error.message;
  msg.classList.remove("max-h-0", "opacity-0", "hidden");
  msg.classList.add("max-h-40", "opacity-100", "flex");
 } finally { button.disabled = false; }
}

function readTextFile(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = function (event) {
			resolve(event.target.result);
		};
		reader.onerror = function (event) {
			reject(event.target.error);
		};
		reader.readAsText(file);
	});
}

async function fileSubmit() {
	const fileInput = document.getElementById("file-upload");
	const file = fileInput.files[0];
	if (file) {
		const fileName = file.name;
		const fileExtension = fileName.split(".").pop().toLowerCase();

		const allowedExtensions = ["txt", "pdf"];

		if (allowedExtensions.includes(fileExtension)) {
			if (fileExtension === "txt") {
				const contents = await readTextFile(file);
				display.innerText = contents;
				getResults(contents);
			} else if (fileExtension === "pdf") {
				// alert("Received pdf");
				const fileReader = new FileReader();
				fileReader.onload = function () {
					const typedArray = new Uint8Array(this.result);
					pdfjsLib.getDocument(typedArray).promise.then(function (pdf) {
						let textContent = "";
						const pagesPromises = [];

						for (let i = 1; i <= pdf.numPages; i++) {
							pagesPromises.push(
								pdf.getPage(i).then(function (page) {
									return page.getTextContent().then(function (textContentPage) {
										const pageText = textContentPage.items.map((item) => item.str).join(" ");
										textContent += pageText + " ";
									});
								})
							);
						}

						Promise.all(pagesPromises).then(() => {
							display.innerText = textContent;
							getResults(textContent);
						});
					});
				};
				fileReader.readAsArrayBuffer(file);
			}
		} else {
			alert("File extension is not allowed. Allowed extensions are .txt and .pdf");
			fileInput.value = "";
		}
	}
}

function toggleSettings() {
	if (document.getElementById("main-body").classList.contains("hidden")) {
		document.getElementById("main-body").classList.remove("hidden");
		document.getElementById("settings").classList.add("hidden");
	} else {
		document.getElementById("main-body").classList.add("hidden");
		document.getElementById("settings").classList.remove("hidden");
	}
}

function logout() {
 activeRequest?.abort();
 activeRequest = null;
 globalStorage.apiKey = "";
 CohereAPI.reset();
 chrome.storage.local.remove("apiKey");
 document.getElementById("apiKey").value = "";
 document.getElementById("loading-overlay").classList.add("hidden");
 document.getElementById("spinner").classList.add("hidden");
 showSetup();
}

function showDashboard() {
	document.getElementById("dashboard").classList.remove("hidden");
	document.getElementById("dashboard").classList.add("flex");
	document.getElementById("setup").classList.remove("flex");
	document.getElementById("setup").classList.add("hidden");
}

function showSetup() {
	document.getElementById("dashboard").classList.add("hidden");
	document.getElementById("dashboard").classList.remove("flex");
	document.getElementById("setup").classList.remove("hidden");
	document.getElementById("setup").classList.add("flex");
}

async function load() {
 const defaults = { apiKey: "", country: "International", religion: "Not Specified", language: "en-US" };
 const data = await chrome.storage.local.get(defaults);
 Object.assign(globalStorage, data);
 for (const key of ["country", "religion", "language"]) document.getElementById(key).value = data[key];
 document.getElementById("tempDisplay").innerText = globalStorage.temperature;
 if (data.apiKey) showDashboard(); else showSetup();
}

/**
 * @returns {Promise<Tab | undefined>} Returns the value of x for the equation.
 */
async function getCurrentTab() {
	let queryOptions = { active: true, lastFocusedWindow: true };
	// `tab` will either be a `tabs.Tab` instance or `undefined`.
	let [tab] = await chrome.tabs.query(queryOptions);
	return tab;
}

/**
 @typedef EventType
 @type {Object}
 @property {string} event The event name.
 @property {Object} [body] The body of the event.
 */

async function onclick() {
	// const display = document.getElementById("display");
	const tab = await getCurrentTab();
	// console.log("current tab", tab);
	await chrome.tabs.sendMessage(tab.id, {
		message: JSON.stringify({
			event: "GET_TEXT",
		}),
	});
}

function getPrompt(language, country, religion) {
	if (language === "en-US" && country === "International" && religion === "Not Specified") {
		return "Analyze the provided text to identify and replace non-inclusive language that pertains to humans. Exclude any words referring to inanimate objects. Ensure the overall text is gender-neutral and culturally sensitive. Also ignore text that doesn't relate to pronouns or cultural issues.";
	}

	let prompt = `Generate an inclusive version of the following text, ensuring it's free from gender-biased${
		religion !== "Not Specified" && (language !== "en-US" || country !== "International")
			? ", culturally insensitive, and religiously"
			: religion !== "Not Specified"
			? " and religiously"
			: " and culturally"
	} insensitive language to `;

	let additionalClauses = [];

	if (religion !== "Not Specified") {
		additionalClauses.push(
			`people who believe in ${religion}`
		);
	}

	if (language !== "en-US") {
		additionalClauses.push(
			`people who speak the language with locale ${language}`
		);
	}

	if (country !== "International") {
		additionalClauses.push(`people in ${country}`);
	}

	prompt += additionalClauses.join(' and ') + ". Assume this message is being sent to ";

	additionalClauses = [];

	if (religion !== "Not Specified") {
		additionalClauses.push(
			`someone very religious, practicing ${religion}`
		);
	}

	if (language !== "en-US") {
		additionalClauses.push(
			`someone who speaks the language with locale ${language}`
		);
	}

	if (country !== "International") {
		additionalClauses.push(`someone in ${country}`);
	}

	prompt += additionalClauses.join(' or ') + `. If there is an [action] and [task or activity] replace it with a specific, more ${
		religion !== "Not Specified" && (language !== "en-US" || country !== "International")
		? "culturally and religiously"
		: religion !== "Not Specified"
		? "religiously"
		: "culturally"
	} approriate [task or activity]. ${country !== "International" ? `Consider laws in ${country} that prohibt certain activites such as drinking or dancing.` : ""}`;

	prompt += "Exclude any words referring to inanimate objects. Ensure the overall text is gender-neutral and culturally sensitive. Also ignore text that doesn't relate to pronouns or cultural issues.";

	if (language !== "en-US") {
		prompt += ` Finally, please read the text and modify your response in the language locale ${language}. Do not return the text in en-US style.`;
	}

	// console.log("prompt", prompt);
	return prompt;
}

function renderHighlights(element, text, replacements) {
 const ranges = [];
 for (const replacement of replacements) {
  if (!replacement) continue;
  const start = text.indexOf(replacement);
  const end = start + replacement.length;
  if (start >= 0 && !ranges.some(range => start < range.end && end > range.start)) ranges.push({ start, end });
 }
 ranges.sort((a, b) => a.start - b.start);
 element.replaceChildren();
 let position = 0;
 for (const range of ranges) {
  element.append(document.createTextNode(text.slice(position, range.start)));
  const span = document.createElement("span");
  span.className = "highlight-final";
  span.textContent = text.slice(range.start, range.end);
  element.append(span);
  position = range.end;
 }
 element.append(document.createTextNode(text.slice(position)));
}

let activeRequest = null;

async function getResults(text) {
 if (!globalStorage.apiKey || !text?.trim()) return;
 activeRequest?.abort();
 const controller = new AbortController();
 activeRequest = controller;
 const overlay = document.getElementById("loading-overlay");
 const spinner = document.getElementById("spinner");
 const results = document.getElementById("results");
 const container = document.getElementById("suggestions-container");
 overlay.classList.remove("hidden");
 spinner.classList.remove("hidden");
 document.getElementById("score").textContent = "";
 container.replaceChildren();
 results.textContent = "";
 try {
  const obj = await CohereAPI.rewrite({
   apiKey: globalStorage.apiKey,
   instructions: getPrompt(globalStorage.language, globalStorage.country, globalStorage.religion),
   text, temperature: globalStorage.temperature, seed: globalStorage.seed,
   signal: controller.signal,
  });
  if (activeRequest !== controller) return;
  renderHighlights(results, obj.inclusiveText, obj.nonInclusiveTexts.map(item => item.replacement));
  for (const item of obj.nonInclusiveTexts) {
   const card = document.createElement("div");
   card.className = "rounded-lg bg-white/10 px-3 py-2 text-sm font-medium w-full";
   for (const [label, value] of [["Text", item.text], ["Reason", item.reason], ["Replacement", item.replacement || "N/A"]]) {
    const row = document.createElement("p");
    const title = document.createElement("strong");
    title.textContent = label + ": ";
    row.append(title);
    if (label === "Text") {
     const span = document.createElement("span");
     span.className = "highlight-original";
     span.textContent = value;
     span.setAttribute("data-original", value);
     span.setAttribute("data-replacement", item.replacement || value);
     span.addEventListener("mouseenter", hoverIn);
     span.addEventListener("mouseleave", hoverOut);
     row.append(span);
    } else { row.append(document.createTextNode(value)); }
    card.append(row);
   }
   container.append(card);
  }
  if (!obj.nonInclusiveTexts.length) container.textContent = "No suggestions.";
  document.getElementById("score").textContent = Math.max(1, 100 - obj.nonInclusiveTexts.length * 2);
  results.title = "Model: " + obj.model;
 } catch (error) {
  if (activeRequest === controller && !controller.signal.aborted) results.textContent = error.message;
 } finally {
  if (activeRequest === controller) {
   overlay.classList.add("hidden");
   spinner.classList.add("hidden");
   activeRequest = null;
  }
 }
}

chrome.runtime.onMessage.addListener(function (request, sender) {
	// console.log(request.message, sender);
	// Keep selected text out of diagnostic logs.
	const event = JSON.parse(request.message);
	if (event.event !== "SELECTED") return;
	const text = event.body;
	// check if the highlighted text is already prompted
	if (activeRequest && display.innerText === text) return;
	display.innerText = text;
	getResults(text);
});

document.addEventListener("DOMContentLoaded", load);
document.getElementById("btn").addEventListener("click", save);
document.getElementById("fn").addEventListener("click", onclick);
document.getElementById("logout").addEventListener("click", logout);
// document.getElementById("logout").addEventListener("click", test);
document.getElementById("cohere").addEventListener("click", gotoCohere);
document.getElementById("file-upload").addEventListener("change", fileSubmit);
document.getElementById("settings-toggle").addEventListener("click", toggleSettings);
document.getElementById("country").addEventListener("change", changeCountry);
document.getElementById("religion").addEventListener("change", changeReligion);
document.getElementById("language").addEventListener("change", changeLanguage);

document.getElementById("seed").addEventListener("change", changeSeed);
document.getElementById("temperature").addEventListener("change", changeTemperature);

function test() {
	chrome.tabs.create({
		url: "main.html"
	});
}

function gotoCohere() {
	chrome.tabs.create({
		url: "https://dashboard.cohere.com/api-keys"
	});
}

function changeSeed(e) {
	globalStorage.seed = Number(e.target.value);
}

function changeTemperature(e) {
	document.getElementById("tempDisplay").innerText = e.target.value;
	globalStorage.temperature = Number(e.target.value);
}

function changeCountry(e) {
	chrome.storage.local.set({ country: e.target.value }).then(() => {
		globalStorage.country = e.target.value;
	});
}

function changeReligion(e) {
	chrome.storage.local.set({ religion: e.target.value }).then(() => {
		globalStorage.religion = e.target.value;
	});
}

function changeLanguage(e) {
	chrome.storage.local.set({ language: e.target.value }).then(() => {
		globalStorage.language = e.target.value;
	});
}

function hoverIn() {
	const replacementText = this.getAttribute("data-replacement");
	this.classList.remove("highlight-original");
	this.classList.add("highlight-final");
	this.textContent = replacementText;
}

function hoverOut() {
	const originalText = this.getAttribute("data-original");
	this.classList.add("highlight-original");
	this.classList.remove("highlight-final");
	this.textContent = originalText;
}
