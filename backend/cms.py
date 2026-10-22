"""Consulta ao CMS pelo Nº de Série (autopreenchimento do ROI).

Hoje devolve dados fictícios (modo demo). Integração real: implemente `lookup` chamando a API do CMS
(ex.: URL em FENIX_CMS_URL + token em FENIX_CMS_TOKEN) e devolva o mesmo formato.
"""
DEMO_DATA = {
    "RM-2026-0147": {"pin": "482913", "apk": "3.8.2",
                     "modem": {"op": "Vivo", "modelo": "Quectel EC25", "imei": "867530041226781", "ns": "MD-77120"},
                     "chip": {"op": "Vivo", "linha": "(11) 91234-5678", "iccid": "8955101234567890123"}},
    "RM-2026-0152": {"pin": "551207", "apk": "3.8.2",
                     "modem": {"op": "Claro", "modelo": "Teltonika RUT241", "imei": "352093081452237", "ns": "MD-77188"},
                     "chip": {"op": "Claro", "linha": "(11) 98765-4321", "iccid": "8955201234567890456"}},
}


def lookup(serie: str, demo: bool):
    """Retorna dict, None (não encontrado) ou levanta NotImplementedError (CMS não configurado)."""
    if demo:
        return DEMO_DATA.get(serie.strip().upper())
    raise NotImplementedError("CMS não configurado")
