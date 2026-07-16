const calculateSMA = require('../indicators/sma');
const buildSignal = require("../helpers/buildSignal");
const CONFIG = {

    TREND_POINTS:3,

    BOS_POINTS:3,

    PULLBACK_POINTS:2,

    MOMENTUM_POINTS:2,

    STRONG_CANDLE:2,

    MEDIUM_CANDLE:1,

    MIN_SCORE:5,

    MIN_DIFF:2,

    HISTORY_MIN:30

};

function syntheticProStrategy(candles, state = {}) {

    const stats = state.stats || {};

    if (!candles || candles.length < 30)
        return {
    signal: null,
    score: 0,
    strategy: "synthetic_pro"
};

    const sma = calculateSMA(candles,12);

    if (!sma)
        return {
    signal: null,
    score: 0,
    strategy: "synthetic_pro"
};

    const last  = candles.at(-2);
    const prev  = candles.at(-3);
    const prev2 = candles.at(-4);

    function strength(c){

    const body=Math.abs(c.close-c.open);

    const range=c.high-c.low;

    if(range===0) return 0;

    return body/range;

}
// PATRON
const color=c=>c.close>c.open?"G":"R";

const pattern=

color(prev2)+

color(prev)+

color(last);

// TENDENCIA

const trendUp=

last.close>sma&&

prev.close>sma;

const trendDown=

last.close<sma&&

prev.close<sma;
 //MOMENTUM
 const momentumUp=

last.close>prev.close&&

prev.close>prev2.close;

const momentumDown=

last.close<prev.close&&

prev.close<prev2.close;
//PULLBACK

const pullbackUp=

prev.low<=sma&&

last.close>sma;

const pullbackDown=

prev.high>=sma&&

last.close<sma;

//BOSS
const prevHigh=Math.max(...candles.slice(-8,-2).map(c=>c.high));

const prevLow=Math.min(...candles.slice(-8,-2).map(c=>c.low));

const bosUp=last.close>prevHigh;

const bosDown=last.close<prevLow;
//AV STRENCH
const avgStrength=(

strength(prev2)+

strength(prev)+

strength(last)

)/3;
//SCORE
let callScore=0;

let putScore=0;

const reasons=[];
// HELPERS

function addCall(points,reason){

callScore+=points;

reasons.push(`CALL +${points} ${reason}`);

}

function addPut(points,reason){

putScore+=points;

reasons.push(`PUT +${points} ${reason}`);

}
// TREND
if (trendUp)
    addCall(CONFIG.TREND_POINTS, "Trend");

if(trendDown)
addPut(CONFIG.TREND_POINTS,"Trend");

//BOSS
if(bosUp)
addCall(CONFIG.BOS_POINTS,"BOS");

if(bosDown)
addPut(CONFIG.BOS_POINTS,"BOS");

//PULLBACK
if(pullbackUp)
addCall(CONFIG.PULLBACK_POINTS,"Pullback");

if(pullbackDown)
addPut(CONFIG.PULLBACK_POINTS,"Pullback");
//MOMENTUM
if(momentumUp)
addCall(2,"Momentum");

if(momentumDown)
addPut(2,"Momentum");
//STRENCH

if(avgStrength>=0.75){

if(trendUp)
addCall(2,"Strong Candles");

if(trendDown)
addPut(2,"Strong Candles");

}
else if(avgStrength>=0.55){

if(trendUp)
addCall(1,"Medium Candles");

if(trendDown)
addPut(1,"Medium Candles");

}
//HISTORY
const currentStats=stats[pattern];

if(currentStats){

    if(currentStats.total>=30){

        if(currentStats.pctGreen>currentStats.pctRed){

            const edge=currentStats.pctGreen-currentStats.pctRed;

            if(edge>=10) addCall(1,"History");

            if(edge>=20) addCall(1,"History");

            if(edge>=30) addCall(1,"History");

        }

        else{

            const edge=currentStats.pctRed-currentStats.pctGreen;

            if(edge>=10) addPut(1,"History");

            if(edge>=20) addPut(1,"History");

            if(edge>=30) addPut(1,"History");

        }

    }

}
//PENALITY
if(trendUp && putScore>0)
putScore--;

if(trendDown && callScore>0)
callScore--;
//DEBUG
console.log("==============================");

console.log("Pattern:",pattern);

console.log("CALL:",callScore);

console.log("PUT :",putScore);

console.table(reasons);

console.log("==============================");
//DESCICION


if (
    callScore >= CONFIG.MIN_SCORE &&
    (callScore - putScore) >= CONFIG.MIN_DIFF
) {

    // Reversión: mercado demasiado alcista
    if (
        callScore >= 10 &&
        avgStrength >= 0.90 &&
        pattern === "GGG" &&
        currentStats?.pctGreen >= 75
    ) {
        return buildSignal({
            strategy: "synthetic_pro",
            signal: "PUT",
            score: callScore,
            trend: trendUp,
            bos: bosUp,
            pullback: pullbackUp,
            momentum: momentumUp,
            strength: avgStrength,
            pattern,
            pctGreen: currentStats?.pctGreen,
            pctRed: currentStats?.pctRed,
            callScore,
            putScore,
            sma
        });
    }

    // Tendencia normal
    return buildSignal({
        strategy: "synthetic_pro",
        signal: "CALL",
        score: callScore,
        trend: trendUp,
        bos: bosUp,
        pullback: pullbackUp,
        momentum: momentumUp,
        strength: avgStrength,
        pattern,
        pctGreen: currentStats?.pctGreen,
        pctRed: currentStats?.pctRed,
        callScore,
        putScore,
        sma
    });
}
if (
    putScore >= CONFIG.MIN_SCORE &&
    (putScore - callScore) >= CONFIG.MIN_DIFF
) {

    // Reversión: mercado demasiado bajista
    if (
        putScore >= 10 &&
        avgStrength >= 0.90 &&
        pattern === "RRR" &&
        currentStats?.pctRed >= 75
    ) {
        return buildSignal({
            strategy: "synthetic_pro",
            signal: "CALL",
            score: putScore,
            trend: trendDown,
            bos: bosDown,
            pullback: pullbackDown,
            momentum: momentumDown,
            strength: avgStrength,
            pattern,
            pctGreen: currentStats?.pctGreen,
            pctRed: currentStats?.pctRed,
            callScore,
            putScore,
            sma
        });
    }

    return buildSignal({
        strategy: "synthetic_pro",
        signal: "PUT",
        score: putScore,
        trend: trendDown,
        bos: bosDown,
        pullback: pullbackDown,
        momentum: momentumDown,
        strength: avgStrength,
        pattern,
        pctGreen: currentStats?.pctGreen,
        pctRed: currentStats?.pctRed,
        callScore,
        putScore,
        sma
    });
}
    


return buildSignal({

    strategy:"synthetic_pro",

    signal:null,

    score:0,

    trend: trendUp ? "UP" : trendDown ? "DOWN" : "SIDE",

    bos: bosUp || bosDown,

    pullback: pullbackUp || pullbackDown,

    momentum: momentumUp || momentumDown,

    strength: avgStrength,

    pattern,

    pctGreen: currentStats?.pctGreen,

    pctRed: currentStats?.pctRed,

    callScore,

    putScore,

    sma

});
}
module.exports = syntheticProStrategy;