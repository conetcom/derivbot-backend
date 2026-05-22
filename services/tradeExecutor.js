class TradeExecutor {
  constructor(deriv) {
    this.deriv = deriv;
  }

  async buy({ amount, contract_type, symbol }) {
    const contract = await this.deriv.buyContract({
      amount,
      contract_type,
      symbol
    });

    if (!contract?.buy?.contract_id) {
      throw new Error("Error creando contrato");
    }

    return contract.buy.contract_id;
  }
}

module.exports = TradeExecutor;