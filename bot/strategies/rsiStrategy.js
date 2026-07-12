const { calculateRSI } = require("../indicators");

function rsiStrategy(candles) {
  const rsi = calculateRSI(candles, 14);
  if (!rsi) return null;

  if (rsi < 20) return{

signal:"CALL",

score:0

};;

  if (rsi > 80) return{

signal:"PUT",

score:0

};

  return null;
}
module.exports = rsiStrategy;