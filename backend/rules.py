"""Regras de negócio: itens do ROI e geração do LEI pré-preenchido a partir do ROI."""

CHECK = [
    ("eletrica", "Instalação Elétrica (Régua/Timer)"),
    ("acesso", "Acessibilidade do Percurso"),
    ("conect", "Conectividade (Sinal de Dados)"),
    ("fixacao", "Fixação e Estabilidade"),
    ("espaco", "Espaço Frontal (mín. 1,10 m p/ porta)"),
    ("limpeza", "Limpeza do Equipamento e Local"),
    ("adesiv", "Integridade da Adesivação (visual)"),
    ("estrut", "Estrutura (sem riscos/amassados)"),
]
CHECK_KEYS = [k for k, _ in CHECK]
FOTO_SLOTS = ["f1", "f2", "f3", "f4", "f5", "f6"]
FOTO_EXTRA = "fx"                                         # canhoto do frete: obrigatória quando há avaria
AVARIA_SLOTS = [FOTO_EXTRA, "fx2", "fx3", "fx4", "fx5"]   # até 5 fotos de avaria
ALL_SLOTS = FOTO_SLOTS + AVARIA_SLOTS

PERFIS = ("tecnico", "gestao", "projetos", "adm", "consulta")
UFS = ("AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
       "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO")

TERMO_PADRAO = (
    "Este documento atesta a conformidade da instalação e da integridade da comunicação visual conforme o escopo do projeto. "
    "Ao validar este laudo, o cliente declara que o equipamento de série [Nº Série] foi entregue em perfeitas condições de uso, "
    "com a adesivação íntegra e de acordo com as especificações contratadas."
)

AGUARDANDO = "AGUARDANDO_VALIDACAO"
DISPONIVEL = "DISPONIVEL_PROJETOS"


def build_lei(checklist: dict, avaria: bool, obs: str) -> dict:
    """checklist: {item: {'ok': bool, 'obs': str}} -> conteúdo editável do LEI."""
    ok = lambda k: checklist.get(k, {}).get("ok") is True
    tec = [
        ("Montagem física", "Instalado conforme projeto, nivelado e fixado.", ok("fixacao")),
        ("Espaço operacional", "Confirmado recuo frontal mínimo de 1,10 m para abertura total da porta e manutenção.", ok("espaco")),
        ("Componentes adicionais", "Régua de energia, modem, timer e acessórios instalados e validados.", ok("eletrica")),
        ("Conectividade", "Sistema de comunicação chip/modem testado e ativo.", ok("conect")),
        ("Status de entrega", "Equipamento configurado, ligado e em operação.", ok("eletrica") and ok("conect") and ok("acesso")),
    ]
    est = [
        ("Adesivação", "Sem bolhas, riscos, rasgos ou descolamentos.", ok("adesiv")),
        ("Estrutura externa", "Sem avarias, amassados ou danos decorrentes do transporte/manuseio.", ok("estrut")),
    ]
    fmt = lambda rows: [{"t": t, "d": d, "ok": o} for t, d, o in rows]
    notas = [f"{nome}: {checklist[k].get('obs', '')}" for k, nome in CHECK if checklist.get(k, {}).get("ok") is False]
    if avaria:
        notas.append("Avaria de transporte registrada (canhoto do frete com ressalva anexado).")
    if obs and obs.strip():
        notas.append(obs.strip())
    return {"tec": fmt(tec), "est": fmt(est), "obs": "\n".join(notas) or "Sem ressalvas.", "termo": TERMO_PADRAO}


# Checklist de preparação na base: ao concluir sem não conformidades, a máquina fica disponível para instalação.
PREP = [("hw", "Instalação de hardware"), ("sw", "Instalação de software"), ("seg", "Instalação de módulos de segurança"),
        ("modem", "Configuração de modem"), ("promo", "Tela/botão promocional"), ("adesiv", "Adesivação")]
PREP_OPCIONAL = {"promo"}                                  # pode ser "não se aplica" (ok = None)
PREP_FOTOS = [("mf", "Frontal (adesivada e ligada)"), ("me", "Lateral esquerda"), ("md", "Lateral direita")]
PREP_SLOTS = [f"i_{k}" for k, _ in PREP] + [k for k, _ in PREP_FOTOS]
M_DISPONIVEL, M_NAO_CONFORME, M_INSTALADA = "DISPONIVEL", "NAO_CONFORME", "INSTALADA"


def validate_prep(d: dict, slots: set) -> str | None:
    """Valida o checklist de preparação enviado pelo app. `slots`: fotos recebidas."""
    if not str(d.get("serie") or "").strip():
        return "Campo obrigatório ausente: nº de série"
    if str(d.get("uf") or "").strip() not in UFS:
        return "Campo obrigatório ausente: estado (UF) da base"
    itens = d.get("itens") or {}
    for k, nome in PREP:
        v = itens.get(k)
        if not isinstance(v, dict) or not (isinstance(v.get("ok"), bool) or (k in PREP_OPCIONAL and v.get("ok") is None and "ok" in v)):
            return f"Checklist sem resposta: {nome}"
        if v["ok"] is False and not str(v.get("obs", "")).strip():
            return f"Observação obrigatória (não conforme): {nome}"
        if v["ok"] is not None and f"i_{k}" not in slots:
            return f"Foto obrigatória ausente: {nome}"
    for k, nome in PREP_FOTOS:
        if k not in slots:
            return f"Foto obrigatória ausente: {nome}"
    return None


def prep_conforme(itens: dict) -> bool:
    return all(itens[k]["ok"] is True or (k in PREP_OPCIONAL and itens[k]["ok"] is None) for k, _ in PREP)


def prep_corrigidos(antes: dict, agora: dict) -> list:
    """Itens que estavam não conformes na preparação anterior e agora não estão mais."""
    return [k for k, _ in PREP if (antes.get(k) or {}).get("ok") is False and agora[k]["ok"] is not False]


def visita(d: dict):
    """Máquinas de uma mesma visita (mesmo cliente): (grupo, (i, n)) ou (None, None) quando é uma máquina só."""
    g, m = str(d.get("grupo") or "").strip()[:64], d.get("maquina") or {}
    try:
        i, n = int(m.get("i")), int(m.get("n"))
    except (TypeError, ValueError, AttributeError):
        return None, None
    return (g, (i, n)) if g and 1 <= i <= n <= 50 else (None, None)


def validate_roi_payload(d: dict) -> str | None:
    """Valida o ROI enviado pelo app. Devolve mensagem de erro ou None."""
    def txt(*path):
        v = d
        for p in path:
            v = v.get(p) if isinstance(v, dict) else None
        return str(v).strip() if v is not None else ""

    if txt("local", "uf") not in UFS:
        return "Campo obrigatório ausente: estado (UF)"
    for path, nome in [(("local", "cliente"), "cliente"), (("local", "ambiente"), "ambiente"), (("local", "endereco"), "endereço"),
                       (("local", "localizacao"), "localização"), (("equip", "serie"), "nº de série"), (("equip", "pin"), "PIN"),
                       (("equip", "apk"), "APK"), (("equip", "modem", "op"), "operadora do modem"), (("equip", "chip", "op"), "operadora do chip"),
                       (("aceite", "nome"), "nome do responsável"), (("aceite", "doc"), "documento do responsável")]:
        if not txt(*path):
            return f"Campo obrigatório ausente: {nome}"
    cl = d.get("checklist") or {}
    for k, nome in CHECK:
        v = cl.get(k)
        if not isinstance(v, dict) or not isinstance(v.get("ok"), bool):
            return f"Checklist sem resposta: {nome}"
        if v["ok"] is False and not str(v.get("obs", "")).strip():
            return f"Observação obrigatória (não conforme): {nome}"
    if not isinstance(d.get("closedAt"), (int, float)):
        return "closedAt ausente"
    return None
