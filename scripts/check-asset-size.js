const fs = require("fs");

for (const file of ["landing.mp4", "landing-vertical.mp4"]) {
  const size = fs.statSync(file).size;
  if (size > 800 * 1024) throw new Error(`${file} is too large: ${size} bytes`);
}

console.log("asset size check passed");
