const botSettingsModel =
  require("../models/botSettingsModel");

const saveSettings = async (
  req,
  res
) => {

  try {

    const user =
      req.user;

    const {
      symbol,
      strategy,
      stake,
      targetProfit,
      stopLoss,
      deriv_account,
      maxDrawdown,
      martingale
    } = req.body;

    const settings =
      await botSettingsModel.saveSettings(
        user.id,
        {
          symbol,
          strategy,
          stake,
          targetProfit,
          stopLoss,
          deriv_account,
          maxDrawdown, 
          martingale
        }
      );

    return res.json({
      success: true,
      settings
    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      error: err.message
    });
  }
};

const getSettings = async (
  req,
  res
) => {

  try {

    const settings =
      await botSettingsModel.getSettings(
        req.user.id
      );

    return res.json(
      settings || {
        symbol: "R_75",
        strategy: "sma",
        stake: 1,
        targetProfit: 10,
        stopLoss: 10,
        deriv_account: null,
        maxDrawdown: 20,
        martingale
      }
    );

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      error: err.message
    });
  }
};

module.exports = {
  saveSettings,
  getSettings
};