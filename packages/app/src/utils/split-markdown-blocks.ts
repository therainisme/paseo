import MarkdownIt from "markdown-it";

const markdownBlockParser = new MarkdownIt();

export function splitMarkdownBlocks(text: string): string[] {
  if (text.length === 0) {
    return [];
  }

  const blocks: string[] = [];
  let currentLines: string[] = [];
  let sawBlockSeparator = false;
  const lines = text.split("\n");
  const structuralBlankLines = getStructuralBlankLines(text, lines);

  for (const [index, line] of lines.entries()) {
    const isBlankLine = line.trim().length === 0;

    if (isBlankLine && structuralBlankLines.has(index)) {
      currentLines.push(line);
      continue;
    }

    if (isBlankLine) {
      if (currentLines.length > 0) {
        sawBlockSeparator = true;
      }
      continue;
    }

    if (sawBlockSeparator) {
      blocks.push(currentLines.join("\n"));
      currentLines = [];
      sawBlockSeparator = false;
    }

    currentLines.push(line);
  }

  if (currentLines.length > 0) {
    blocks.push(currentLines.join("\n"));
  }

  return blocks.filter((block) => block.length > 0 && !isThematicBreakOnlyBlock(block));
}

// A block made only of thematic breaks renders nothing once the hr rule is
// dropped, but would still claim a block margin, so drop the whole block.
function isThematicBreakOnlyBlock(block: string): boolean {
  const lines = block.split("\n").filter((line) => line.trim().length > 0);
  return lines.length > 0 && lines.every(isThematicBreakLine);
}

function isThematicBreakLine(line: string): boolean {
  return /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line);
}

function getStructuralBlankLines(text: string, lines: string[]): Set<number> {
  const blankLines = new Set<number>();
  for (const token of markdownBlockParser.parse(text, {})) {
    if (token.level !== 0 || !token.map) {
      continue;
    }
    const [start, end] = token.map;
    for (let index = start; index < end - 1; index += 1) {
      if (lines[index]?.trim().length === 0) {
        blankLines.add(index);
      }
    }
  }
  return blankLines;
}
