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
FOTO_EXTRA = "fx"
ALL_SLOTS = FOTO_SLOTS + [FOTO_EXTRA]

PERFIS = ("tecnico", "gestao", "projetos", "adm", "consulta")

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


def validate_roi_payload(d: dict) -> str | None:
    """Valida o ROI enviado pelo app. Devolve mensagem de erro ou None."""
    def txt(*path):
        v = d
        for p in path:
            v = v.get(p) if isinstance(v, dict) else None
        return str(v).strip() if v is not None else ""

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
