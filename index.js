const { readFileSync } = require('fs');
const { resolve } = require('path');
const { types } = require('sass');
const parse = require('htmlparser2').parseDOM;
const { selectAll, selectOne } = require('css-select');
const serialize = require('dom-serializer').default;
const svgToDataUri = require('mini-svg-data-uri');
const svgo = require('svgo');

const defaultOptions = {
  encodingFormat: 'base64',
  optimize: false
};

/**
 * The SVG inliner function
 * This is a factory that expects a base path abd returns the actual function
 *
 * @param base
 * @param opts {optimize: true/false}
 * @returns {Function}
 */
module.exports = function inliner(base, opts) {
  const options = {
    ...defaultOptions,
    ...opts
  };

  return (path, selectors) => {
    try {
      let content = readFileSync(resolve(base, path.getValue()));

      if (selectors?.getLength && selectors.getLength()) {
        content = changeStyle(content, selectors);
      }

      if (options.optimize) {
        content = Buffer.from(svgo.optimize(content).data, 'utf8');
      }

      return encode(content, options.encodingFormat);
    } catch (err) {
      console.log(err);
    }
  };
};

/**
 * Encode the string
 *
 * @param content
 * @param opts
 * @returns {types.String}
 */
function encode(content, encodingFormat) {
  if (encodingFormat === 'uri') {
    return new types.String(`url("${svgToDataUri(content.toString('utf8'))}")`);
  }

  if (encodingFormat === 'base64') {
    return new types.String(`url("data:image/svg+xml;base64,${content.toString('base64')}")`);
  }

  throw new Error(`encodingFormat "${encodingFormat}" is not supported`);
}

/**
 * Change the style of the SVG
 *
 * @param source
 * @param styles
 * @returns {*}
 */
function changeStyle(source, selectors) {
  const dom = parse(source, { xmlMode: true });
  const svg = dom ? selectOne('svg', dom) : null;

  if (!svg) {
    throw Error('Invalid SVG file');
  }

  const obj = mapToObj(selectors);

  for (const selector in obj) {
    const elements = selectAll(selector, svg);
    const attribs = obj[selector];

    for (const element of elements) {
      element.attribs = {
        ...element.attribs,
        ...attribs
      };
    }
  }

  return Buffer.from(serialize(dom), 'utf8');
}

/**
 * Transform a sass map into a js object
 *
 * @param map
 */
function mapToObj(map) {
  const obj = Object.create(null);

  for (let i = 0, len = map.getLength(); i < len; i++) {
    const key = map.getKey(i).getValue();
    let value = map.getValue(i);

    switch (value.constructor.name) {
      case types.Map.name:
        value = mapToObj(value);
        break;
      case types.Color.name:
        if (value.getA() === 1) {
          value = `rgb(${value.getR()},${value.getG()},${value.getB()})`;
        } else {
          value = `rgba(${value.getR()},${value.getG()},${value.getB()},${value.getA()})`;
        }
        break;
      default:
        value = value.getValue();
    }

    obj[key] = value;
  }

  return obj;
}
