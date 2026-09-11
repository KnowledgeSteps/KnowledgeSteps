package com.zhihu.hackathon.auth;

import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/** 使用固定参数校验密码哈希，避免把明文密码存入数据库或版本库。 */
final class AdminPassword {
  private static final int ITERATIONS = 600_000;
  private final byte[] salt;
  private final byte[] expected;

  AdminPassword(String encoded) {
    try {
      String[] parts = encoded.split("\\$", -1);
      if (parts.length != 4 || !parts[0].equals("pbkdf2-sha256")
          || !parts[1].equals(Integer.toString(ITERATIONS))) {
        throw new IllegalArgumentException();
      }
      salt = Base64.getDecoder().decode(parts[2]);
      expected = Base64.getDecoder().decode(parts[3]);
      if (salt.length != 16 || expected.length != 32) throw new IllegalArgumentException();
    } catch (RuntimeException error) {
      throw new IllegalArgumentException("Invalid auth.admin.password-hash configuration");
    }
  }

  boolean matches(String password) {
    if (password == null || password.isEmpty() || password.length() > 256) return false;
    char[] chars = password.toCharArray();
    PBEKeySpec spec = new PBEKeySpec(chars, salt, ITERATIONS, 256);
    byte[] actual = null;
    try {
      actual = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
      return MessageDigest.isEqual(expected, actual);
    } catch (GeneralSecurityException error) {
      throw new IllegalStateException("Password verification unavailable");
    } finally {
      Arrays.fill(chars, '\0');
      spec.clearPassword();
      if (actual != null) Arrays.fill(actual, (byte) 0);
    }
  }
}
