// Controlo de tentativas falhadas em memória (código da mesa, login, etc.).
class Tentativas {
  constructor({ max = 8, janelaMs = 10 * 60 * 1000 } = {}) {
    this.max = max;
    this.janelaMs = janelaMs;
    this.registos = new Map();
    this.timer = setInterval(() => this.limpar(), Math.min(janelaMs, 60 * 60 * 1000));
    this.timer.unref();
  }

  limpar() {
    const agora = Date.now();
    for (const [chave, registo] of this.registos) {
      if (agora - registo.inicio > this.janelaMs) this.registos.delete(chave);
    }
  }

  estado(chave) {
    const registo = this.registos.get(chave);
    if (!registo) return { bloqueado: false, restantes: this.max, esperarSegundos: 0 };
    if (Date.now() - registo.inicio > this.janelaMs) {
      this.registos.delete(chave);
      return { bloqueado: false, restantes: this.max, esperarSegundos: 0 };
    }
    const restantes = Math.max(0, this.max - registo.contagem);
    return {
      bloqueado: restantes <= 0,
      restantes,
      esperarSegundos: Math.ceil((registo.inicio + this.janelaMs - Date.now()) / 1000)
    };
  }

  falhou(chave) {
    const registo = this.registos.get(chave);
    if (!registo || Date.now() - registo.inicio > this.janelaMs) {
      this.registos.set(chave, { contagem: 1, inicio: Date.now() });
    } else {
      registo.contagem += 1;
    }
    return this.estado(chave);
  }

  sucesso(chave) {
    this.registos.delete(chave);
  }
}

module.exports = Tentativas;
