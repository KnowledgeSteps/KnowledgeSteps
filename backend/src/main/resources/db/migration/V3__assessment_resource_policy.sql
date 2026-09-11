-- 保留旧图谱、答案及缓存行，按新规则重新标记；下一次提交补齐资料，不重跑模型。
UPDATE knowledge_nodes SET mastery_status=CASE
 WHEN (SELECT a.answer_value FROM assessment_questions q JOIN assessment_answers a ON a.question_id=q.id WHERE q.node_id=knowledge_nodes.id)='VERY_FAMILIAR' THEN 'MASTERED'
 WHEN EXISTS (SELECT 1 FROM assessment_questions q JOIN assessment_answers a ON a.question_id=q.id WHERE q.node_id=knowledge_nodes.id) THEN 'TO_LEARN'
 ELSE 'UNKNOWN' END,
 resource_status=CASE
 WHEN (SELECT a.answer_value FROM assessment_questions q JOIN assessment_answers a ON a.question_id=q.id WHERE q.node_id=knowledge_nodes.id)='VERY_FAMILIAR' THEN 'NOT_APPLICABLE'
 ELSE 'PENDING' END
WHERE is_target=0;
UPDATE learning_sessions SET status='READY',completed_at=NULL WHERE status='COMPLETED';
