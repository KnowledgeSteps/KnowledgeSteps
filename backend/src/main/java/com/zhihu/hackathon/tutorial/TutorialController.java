package com.zhihu.hackathon.tutorial;

import com.zhihu.hackathon.auth.CsrfTokens;
import com.zhihu.hackathon.auth.CurrentUserProvider;
import com.zhihu.hackathon.session.SessionException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

/** Tutorial records never refer to or mutate learning sessions, doubts or favorites. */
@RestController
@RequestMapping("/api/v1/tutorial")
public class TutorialController {
  public record Progress(int step, boolean prompted, int revision) {}
  public record Change(String action, Integer revision) {}
  private final JdbcTemplate jdbc;
  private final CurrentUserProvider users;
  private final CsrfTokens csrf;
  public TutorialController(JdbcTemplate jdbc, CurrentUserProvider users, CsrfTokens csrf) {
    this.jdbc=jdbc;this.users=users;this.csrf=csrf;
  }
  @ModelAttribute public void noCache(HttpServletResponse response) { response.setHeader("Cache-Control","no-store"); }
  private Progress read(long user) {
    var rows=jdbc.query("SELECT step,prompted,revision FROM tutorial_progress WHERE user_id=?",
        (rs,n)->new Progress(rs.getInt(1),rs.getBoolean(2),rs.getInt(3)),user);
    return rows.isEmpty()?new Progress(0,false,0):rows.getFirst();
  }
  @GetMapping public Progress get() { return read(users.currentUserId()); }
  @PatchMapping public Progress change(@RequestBody Change change,HttpServletRequest request) {
    long user=users.currentUserId();csrf.verify(request);
    if(change==null || change.action()==null || change.revision()==null || change.revision()<0
        || !java.util.Set.of("seen","advance","reset").contains(change.action()))
      throw new SessionException(400,"INVALID_TUTORIAL_CHANGE","教程操作不正确。");
    String now=Instant.now().toString();
    jdbc.update("INSERT OR IGNORE INTO tutorial_progress(user_id,updated_at) VALUES (?,?)",user,now);
    // Compare-and-swap prevents a second tab or a retried request skipping a step.
    String step=change.action().equals("advance")?"MIN(step+1,5)":change.action().equals("reset")?"0":"step";
    String completed=change.action().equals("reset")?"NULL":change.action().equals("advance")?
        "CASE WHEN step>=4 THEN COALESCE(completed_at,?) ELSE completed_at END":"completed_at";
    String sql="UPDATE tutorial_progress SET step="+step+",prompted=1,revision=revision+1,updated_at=?,completed_at="+completed+" WHERE user_id=? AND revision=?";
    int updated=change.action().equals("advance")?jdbc.update(sql,now,now,user,change.revision()):jdbc.update(sql,now,user,change.revision());
    if(updated==0) throw new SessionException(409,"TUTORIAL_CHANGED","教程进度已在其他页面更新，请重新读取后继续。");
    return read(user);
  }
}
