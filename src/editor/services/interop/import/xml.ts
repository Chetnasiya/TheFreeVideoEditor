export interface SimpleXmlNode {
	tagName: string;
	attributes: Record<string, string>;
	children: SimpleXmlNode[];
	textContent: string;
	getAttribute(name: string): string | null;
	querySelector(selector: string): SimpleXmlNode | null;
	querySelectorAll(selector: string): SimpleXmlNode[];
}

export function parseXml(xmlString: string): SimpleXmlNode {
	if (typeof DOMParser !== 'undefined') {
		const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
		const parserError = doc.querySelector('parsererror');
		if (parserError) {
			throw new Error(`XML Syntax Error: ${parserError.textContent}`);
		}
		return wrapDomNode(doc.documentElement);
	}
	return parseXmlString(xmlString);
}

function wrapDomNode(el: Element): SimpleXmlNode {
	return {
		tagName: el.tagName,
		attributes: Object.fromEntries(Array.from(el.attributes).map((a) => [a.name, a.value])),
		textContent: el.textContent || '',
		getAttribute(name: string) {
			return el.getAttribute(name);
		},
		querySelector(selector: string) {
			const res = el.querySelector(selector);
			return res ? wrapDomNode(res) : null;
		},
		querySelectorAll(selector: string) {
			return Array.from(el.querySelectorAll(selector)).map(wrapDomNode);
		},
		get children() {
			return Array.from(el.children).map(wrapDomNode);
		}
	};
}

export function parseXmlString(xml: string): SimpleXmlNode {
	// Strip xml declaration, doctype, and comments
	const clean = xml
		.replace(/<\?xml[\s\S]*?\?>/gi, '')
		.replace(/<!DOCTYPE[\s\S]*?>/gi, '')
		.replace(/<!--[\s\S]*?-->/g, '')
		.trim();

	let pos = 0;

	function skipWhitespace() {
		while (pos < clean.length && /\s/.test(clean[pos]!)) {
			pos++;
		}
	}

	function parseElement(): SimpleXmlNode {
		skipWhitespace();
		if (clean[pos] !== '<') {
			throw new Error(`Expected '<' at pos ${pos}, found '${clean[pos]}'`);
		}
		pos++; // skip '<'

		// Tag name
		const tagMatch = clean.slice(pos).match(/^([a-zA-Z0-9_-]+)/);
		if (!tagMatch) throw new Error(`Invalid tag name at pos ${pos}`);
		const tagName = tagMatch[1]!;
		pos += tagName.length;

		// Attributes
		const attributes: Record<string, string> = {};
		while (pos < clean.length) {
			skipWhitespace();
			if (clean[pos] === '>' || (clean[pos] === '/' && clean[pos + 1] === '>')) {
				break;
			}
			const attrMatch = clean.slice(pos).match(/^([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/);
			if (attrMatch) {
				attributes[attrMatch[1]!] = attrMatch[2] !== undefined ? attrMatch[2] : attrMatch[3]!;
				pos += attrMatch[0].length;
			} else {
				// Boolean attribute or unknown
				const boolMatch = clean.slice(pos).match(/^([a-zA-Z0-9_-]+)/);
				if (boolMatch) {
					attributes[boolMatch[1]!] = 'true';
					pos += boolMatch[0].length;
				} else {
					pos++;
				}
			}
		}

		skipWhitespace();
		// Self closing?
		if (clean[pos] === '/' && clean[pos + 1] === '>') {
			pos += 2;
			return createNode(tagName, attributes, [], '');
		}

		if (clean[pos] === '>') {
			pos++;
		}

		// Children and text
		const children: SimpleXmlNode[] = [];
		let text = '';

		while (pos < clean.length) {
			const nextTag = clean.indexOf('<', pos);
			if (nextTag === -1) {
				text += clean.slice(pos);
				pos = clean.length;
				break;
			}

			if (nextTag > pos) {
				text += clean.slice(pos, nextTag);
				pos = nextTag;
			}

			// End tag?
			if (clean.slice(pos, pos + 2 + tagName.length) === `</${tagName}>`) {
				pos += 2 + tagName.length + 1; // skip </tagName>
				break;
			}

			// Some other end tag?
			if (clean.slice(pos, pos + 2) === '</') {
				const endMatch = clean.slice(pos).match(/^<\/([a-zA-Z0-9_-]+)>/);
				if (endMatch) {
					pos += endMatch[0].length;
					break;
				}
			}

			// Child element
			const child = parseElement();
			children.push(child);
		}

		return createNode(tagName, attributes, children, unescapeXml(text.trim()));
	}

	return parseElement();
}

function unescapeXml(str: string): string {
	return str
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'");
}

function createNode(
	tagName: string,
	attributes: Record<string, string>,
	children: SimpleXmlNode[],
	textContent: string
): SimpleXmlNode {
	const node: SimpleXmlNode = {
		tagName,
		attributes,
		children,
		textContent: children.length === 0 ? textContent : children.map((c) => c.textContent).join(''),
		getAttribute(name: string) {
			return attributes[name] ?? null;
		},
		querySelector(selector: string): SimpleXmlNode | null {
			const trimmed = selector.trim();
			const isDirectChild = trimmed.startsWith(':scope >') || trimmed.startsWith('>');
			const parts = trimmed
				.replace(/^:scope\s*>\s*/, '')
				.replace(/^>\s*/, '')
				.split(/\s*>\s*/);

			if (parts.length > 1) {
				const [first, ...rest] = parts;
				const matchingFirst = isDirectChild
					? children.filter((c) => c.tagName === first)
					: this.querySelectorAll(first!);
				for (const m of matchingFirst) {
					const found = m.querySelector(`> ${rest.join(' > ')}`);
					if (found) return found;
				}
				return null;
			}

			const targetTag = parts[0]!;
			for (const child of children) {
				if (child.tagName === targetTag) return child;
			}
			if (!isDirectChild) {
				for (const child of children) {
					const found = child.querySelector(targetTag);
					if (found) return found;
				}
			}
			return null;
		},
		querySelectorAll(selector: string): SimpleXmlNode[] {
			const trimmed = selector.trim();
			const isDirectChild = trimmed.startsWith(':scope >') || trimmed.startsWith('>');
			const parts = trimmed
				.replace(/^:scope\s*>\s*/, '')
				.replace(/^>\s*/, '')
				.split(/\s*>\s*/);

			if (parts.length > 1) {
				const [first, ...rest] = parts;
				const matchingFirst = isDirectChild
					? children.filter((c) => c.tagName === first)
					: this.querySelectorAll(first!);
				return matchingFirst.flatMap((c) => c.querySelectorAll(`> ${rest.join(' > ')}`));
			}

			const results: SimpleXmlNode[] = [];
			const targetTag = parts[0]!;
			for (const child of children) {
				if (child.tagName === targetTag) results.push(child);
				if (!isDirectChild) {
					results.push(...child.querySelectorAll(targetTag));
				}
			}
			return results;
		}
	};

	return node;
}
