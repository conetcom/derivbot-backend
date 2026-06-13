const axios = require("axios");

class DerivAccountsService {

  static async getAccounts(token) {

    const response = await axios.get(
      "https://api.derivws.com/trading/v1/options/accounts",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Deriv-App-ID": process.env.DERIV_APP_ID
        }
      }
    );

    return response.data?.data || [];
  }

}

module.exports = DerivAccountsService;