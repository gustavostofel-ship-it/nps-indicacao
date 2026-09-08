-- ============================================================================
-- Correção: toda situação da planilha da Assistência 24h é elegível.
-- Rode este arquivo inteiro no SQL Editor do Supabase.
--
-- A migração original só marcava "Finalizado" como elegível — na prática
-- isso descartava a maioria dos atendimentos da fila (a maior parte da
-- planilha vem como "Aguardando Check List", por exemplo). Decisão: se o
-- atendimento entrou na planilha, o colaborador já considera que vale ligar
-- pra avaliar — então todas as situações nascem elegíveis. Continua
-- ajustável em Configurações a qualquer momento, caso queira excluir alguma
-- situação específica no futuro.
-- ============================================================================

UPDATE atendimento_situacao SET conta_como_elegivel = true;
