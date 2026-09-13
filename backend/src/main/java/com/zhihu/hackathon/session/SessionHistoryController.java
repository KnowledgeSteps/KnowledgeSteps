package com.zhihu.hackathon.session;

import com.zhihu.hackathon.auth.CurrentUserProvider;
import com.zhihu.hackathon.auth.CsrfTokens;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;

@RestController
@RequestMapping("/api/v1/learning-sessions")
public class SessionHistoryController {
  private final CurrentUserProvider users;
  private final JdbcTemplate jdbc;
  private final CsrfTokens csrf;
  private final LearningSessionService sessions;
  private final JdbcSessionDeletion deletion;
  public SessionHistoryController(CurrentUserProvider users, JdbcTemplate jdbc, CsrfTokens csrf, LearningSessionService sessions,
      JdbcSessionDeletion deletion) {
    this.users=users; this.jdbc=jdbc; this.csrf=csrf; this.sessions=sessions;
    this.deletion=deletion;
  }
  public record Item(String sessionId,String target,String status,String createdAt,String targetDescription) {}
  public record History(long total,int page,int pageSize,List<Item> items) {}
  @GetMapping
  @Transactional(readOnly=true)
  public ResponseEntity<History> list(@RequestParam(defaultValue="1") int page) {
    long userId=users.currentUserId();
    if(page<1 || page>1_000_000) throw new SessionException(400,"INVALID_PAGE","页码不正确。");
    long total=jdbc.queryForObject("SELECT COUNT(*) FROM learning_sessions WHERE user_id=?",Long.class,userId);
    var items=jdbc.query("SELECT s.id,s.target_name,s.status,s.created_at,(SELECT n.description FROM knowledge_nodes n WHERE n.session_id=s.id AND n.is_target=1 ORDER BY n.id LIMIT 1) FROM learning_sessions s WHERE s.user_id=? ORDER BY s.id DESC LIMIT 20 OFFSET ?",
        (rs,row)->new Item(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4),rs.getString(5)),userId,(page-1)*20);
    return ResponseEntity.ok().header("Cache-Control","no-store").body(new History(total,page,20,items));
  }
  @DeleteMapping("/{sessionId}")
  public java.util.Map<String,Boolean> delete(@PathVariable String sessionId, HttpServletRequest request) {
    long userId=users.currentUserId();
    csrf.verify(request);
    long id;
    try { id=Long.parseLong(sessionId); }
    catch(NumberFormatException ex) { throw new SessionException(404,"NOT_FOUND","寻路记录不存在。"); }
    deletion.deleteOwned(userId, id, () -> sessions.cancelDeleted(userId, id));
    return java.util.Map.of("deleted",true);
  }

}
