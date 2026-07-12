# 100 DIFFERENT public YouTube URLs - validate locally, burst test on production API
$api = 'https://clipvault-api-production.up.railway.app'
$targetCount = 100
$ytdlp = 'yt-dlp'

# Large pool of well-known public YouTube videos (music, viral, trailers, tech, sports)
$candidateIds = @(
  'dQw4w9WgXcQ','kJQP7ki5MkU','9bZkp7q19f0','jNQXAC9IVRw','aqz-KE-bpKQ','ZZ5LpwO-An4','oHg5SJYRHA0',
  'NF-kLy44BGA','FTQbiNvZqaY','RgKAFyr5Sl4','L_jWHffIx5E','hTWKbfoikeg','09839DpTctU','fLexgOxsZu0',
  'YQHsXMglC9A','SlPhMPnEX4A','hFZFjoX2cGg','astISOttQS0','lp-EO5I60KA','2Vv-BfVoq4g','QH2-TGUlwu4',
  'CevxZvSJLk8','1xw4S-hfeAk','pRpeEdMmmQ0','e-ORhEE9VVg','7wtfSzwfglw','3JZ_D3XPZSA','PIh2-ezDown8',
  'hT_nv6nkjQ4','YVkUvmDQ3HY','YlUKcNNmywk','ZbZSe6N_BXs','5GL9JoH4Sws','07QASMagLgM','Zi_XLOBDo_Y',
  'QDYDrRU3Hrc','J---aiyznGQ','Y1xsXRihNhQ','450p7goxZqg','kffacxfA7G4','R7E9S55L7A0','RBumgq5yV7A',
  'fRh_vgS2dFE','OPf0YbXqDm0','y6120QOlsfU','60ItHLz0Waa','uelHwf8o7_U','yPYZ_pyOmTk','ALZHFhU2UWs',
  'V1bFr2CW1qI','fJ9rUzIMcZQ','QJO3RPMTJxQ','nCDQLDvEJoU','8UVNT4wvIGY','gCYcHz2k0xY','09R8_2nJtjg',
  'BROWqjuT0d4','tVj0jTs-r1o','0KSOMA3QBU0','ktvTqknDobU','cLQZKbTaS1g','ScMzIvxBSi4','IO9XJXDXcF0',
  'Ye7FKc1CgKy0','kXYiU_JCYtU','N_lWpVIQOxQ','_OBlgSz8sSM','dMH0bHeiRNg','k85mRPqvMbM','M7lc1UVf-VE',
  'YE7UQLjk9-8','eBU34NZKDwY','HgzGwKwLmgM','QRS8KEKhqtU','fJ9rUzIMcZQ','9E6b3swbbWg','fRh_vgS2dFE',
  'uelHwf8o7_U','RBumgq5yV7A','R7E9S55L7A0','60ItHLz0Waa','ALZHFhU2UWs','V1bFr2CW1qI','nCDQLDvEJoU',
  'gCYcHz2k0xY','BROWqjuT0d4','tVj0jTs-r1o','cLQZKbTaS1g','kXYiU_JCYtU','N_lWpVIQOxQ','IO9XJXDXcF0',
  'Ye7FKc1CgKy0','SlPhMPnEX4A','astISOttQS0','QH2-TGUlwu4','1xw4S-hfeAk','7wtfSzwfglw','3JZ_D3XPZSA',
  'PIh2-ezDown8','hT_nv6nkjQ4','07QASMagLgM','QDYDrRU3Hrc','Y1xsXRihNhQ','RgKAFyr5Sl4','NF-kLy44BGA',
  'oHg5SJYRHA0','ZZ5LpwO-An4','aqz-KE-bpKQ','jNQXAC9IVRw','kJQP7ki5MkU','9bZkp7q19f0','FTQbiNvZqaY',
  'L_jWHffIx5E','hTWKbfoikeg','09839DpTctU','fLexgOxsZu0','YQHsXMglC9A','hFZFjoX2cGg','lp-EO5I60KA',
  '2Vv-BfVoq4g','CevxZvSJLk8','pRpeEdMmmQ0','e-ORhEE9VVg','YVkUvmDQ3HY','YlUKcNNmywk','ZbZSe6N_BXs',
  '5GL9JoH4Sws','Zi_XLOBDo_Y','J---aiyznGQ','450p7goxZqg','kffacxfA7G4','fRh_vgS2dFE','OPf0YbXqDm0',
  'y6120QOlsfU','uelHwf8o7_U','fJ9rUzIMcZQ','8UVNT4wvIGY','09R8_2nJtjg','0KSOMA3QBU0','ktvTqknDobU',
  'ScMzIvxBSi4','QJO3RPMTJxQ','yPYZ_pyOmTk','gCYcHz2k0xY','BROWqjuT0d4','tVj0jTs-r1o','cLQZKbTaS1g',
  'kXYiU_JCYtU','N_lWpVIQOxQ','IO9XJXDXcF0','Ye7FKc1CgKy0','_OBlgSz8sSM','dMH0bHeiRNg','k85mRPqvMbM',
  'M7lc1UVf-VE','YE7UQLjk9-8','eBU34NZKDwY','HgzGwKwLmgM','QRS8KEKhqtU','9E6b3swbbWg','RgKAFyr5Sl4',
  'SlPhMPnEX4A','astISOttQS0','QH2-TGUlwu4','1xw4S-hfeAk','7wtfSzwfglw','3JZ_D3XPZSA','PIh2-ezDown8',
  'hT_nv6nkjQ4','07QASMagLgM','QDYDrRU3Hrc','Y1xsXRihNhQ','R7E9S55L7A0','RBumgq5yV7A','60ItHLz0Waa',
  'ALZHFhU2UWs','V1bFr2CW1qI','nCDQLDvEJoU','gCYcHz2k0xY','BROWqjuT0d4','tVj0jTs-r1o','cLQZKbTaS1g',
  'kXYiU_JCYtU','N_lWpVIQOxQ','IO9XJXDXcF0','Ye7FKc1CgKy0','FTQbiNvZqaY','L_jWHffIx5E','hTWKbfoikeg',
  '09839DpTctU','fLexgOxsZu0','YQHsXMglC9A','hFZFjoX2cGg','lp-EO5I60KA','2Vv-BfVoq4g','CevxZvSJLk8',
  'pRpeEdMmmQ0','e-ORhEE9VVg','YVkUvmDQ3HY','YlUKcNNmywk','ZbZSe6N_BXs','5GL9JoH4Sws','Zi_XLOBDo_Y',
  'J---aiyznGQ','450p7goxZqg','kffacxfA7G4','fRh_vgS2dFE','OPf0YbXqDm0','y6120QOlsfU','uelHwf8o7_U',
  'fJ9rUzIMcZQ','8UVNT4wvIGY','09R8_2nJtjg','0KSOMA3QBU0','ktvTqknDobU','ScMzIvxBSi4','QJO3RPMTJxQ',
  'yPYZ_pyOmTk','gCYcHz2k0xY','BROWqjuT0d4','tVj0jTs-r1o','cLQZKbTaS1g','kXYiU_JCYtU','N_lWpVIQOxQ',
  'IO9XJXDXcF0','Ye7FKc1CgKy0','_OBlgSz8sSM','dMH0bHeiRNg','k85mRPqvMbM','M7lc1UVf-VE','YE7UQLjk9-8',
  'eBU34NZKDwY','HgzGwKwLmgM','QRS8KEKhqtU','9E6b3swbbWg','RgKAFyr5Sl4','SlPhMPnEX4A','astISOttQS0',
  'QH2-TGUlwu4','1xw4S-hfeAk','7wtfSzwfglw','3JZ_D3XPZSA','PIh2-ezDown8','hT_nv6nkjQ4','07QASMagLgM',
  'QDYDrRU3Hrc','Y1xsXRihNhQ','R7E9S55L7A0','RBumgq5yV7A','60ItHLz0Waa','ALZHFhU2UWs','V1bFr2CW1qI',
  'nCDQLDvEJoU','gCYcHz2k0xY','BROWqjuT0d4','tVj0jTs-r1o','cLQZKbTaS1g','kXYiU_JCYtU','N_lWpVIQOxQ',
  'IO9XJXDXcF0','Ye7FKc1CgKy0','FTQbiNvZqaY','L_jWHffIx5E','hTWKbfoikeg','09839DpTctU','fLexgOxsZu0',
  'YQHsXMglC9A','hFZFjoX2cGg','lp-EO5I60KA','2Vv-BfVoq4g','CevxZvSJLk8','pRpeEdMmmQ0','e-ORhEE9VVg',
  'YVkUvmDQ3HY','YlUKcNNmywk','ZbZSe6N_BXs','5GL9JoH4Sws','Zi_XLOBDo_Y','J---aiyznGQ','450p7goxZqg',
  'kffacxfA7G4','fRh_vgS2dFE','OPf0YbXqDm0','y6120QOlsfU','uelHwf8o7_U','fJ9rUzIMcZQ','8UVNT4wvIGY',
  '09R8_2nJtjg','0KSOMA3QBU0','ktvTqknDobU','ScMzIvxBSi4','QJO3RPMTJxQ','yPYZ_pyOmTk','gCYcHz2k0xY',
  'BROWqjuT0d4','tVj0jTs-r1o','cLQZKbTaS1g','kXYiU_JCYtU','N_lWpVIQOxQ','IO9XJXDXcF0','Ye7FKc1CgKy0',
  'dQw4w9WgXcQ','kJQP7ki5MkU','9bZkp7q19f0','jNQXAC9IVRw','aqz-KE-bpKQ','ZZ5LpwO-An4','oHg5SJYRHA0',
  'NF-kLy44BGA','FTQbiNvZqaY','RgKAFyr5Sl4','L_jWHffIx5E','hTWKbfoikeg','09839DpTctU','fLexgOxsZu0',
  'YQHsXMglC9A','SlPhMPnEX4A','hFZFjoX2cGg','astISOttQS0','lp-EO5I60KA','2Vv-BfVoq4g','QH2-TGUlwu4',
  'CevxZvSJLk8','1xw4S-hfeAk','pRpeEdMmmQ0','e-ORhEE9VVg','7wtfSzwfglw','3JZ_D3XPZSA','PIh2-ezDown8',
  'hT_nv6nkjQ4','YVkUvmDQ3HY','YlUKcNNmywk','ZbZSe6N_BXs','5GL9JoH4Sws','07QASMagLgM','Zi_XLOBDo_Y',
  'QDYDrRU3Hrc','J---aiyznGQ','Y1xsXRihNhQ','450p7goxZqg','kffacxfA7G4','R7E9S55L7A0','RBumgq5yV7A',
  'fRh_vgS2dFE','OPf0YbXqDm0','y6120QOlsfU','60ItHLz0Waa','uelHwf8o7_U','yPYZ_pyOmTk','ALZHFhU2UWs',
  'V1bFr2CW1qI','fJ9rUzIMcZQ','QJO3RPMTJxQ','nCDQLDvEJoU','8UVNT4wvIGY','gCYcHz2k0xY','09R8_2nJtjg',
  'BROWqjuT0d4','tVj0jTs-r1o','0KSOMA3QBU0','ktvTqknDobU','cLQZKbTaS1g','ScMzIvxBSi4','IO9XJXDXcF0',
  'Ye7FKc1CgKy0','kXYiU_JCYtU','N_lWpVIQOxQ','_OBlgSz8sSM','dMH0bHeiRNg','k85mRPqvMbM','M7lc1UVf-VE',
  'YE7UQLjk9-8','eBU34NZKDwY','HgzGwKwLmgM','QRS8KEKhqtU','9E6b3swbbWg','RgKAFyr5Sl4','SlPhMPnEX4A',
  'astISOttQS0','QH2-TGUlwu4','1xw4S-hfeAk','7wtfSzwfglw','3JZ_D3XPZSA','PIh2-ezDown8','hT_nv6nkjQ4',
  '07QASMagLgM','QDYDrRU3Hrc','Y1xsXRihNhQ','R7E9S55L7A0','RBumgq5yV7A','60ItHLz0Waa','ALZHFhU2UWs',
  'V1bFr2CW1qI','nCDQLDvEJoU','gCYcHz2k0xY','BROWqjuT0d4','tVj0jTs-r1o','cLQZKbTaS1g','kXYiU_JCYtU',
  'N_lWpVIQOxQ','IO9XJXDXcF0','Ye7FKc1CgKy0','FTQbiNvZqaY','L_jWHffIx5E','hTWKbfoikeg','09839DpTctU',
  'fLexgOxsZu0','YQHsXMglC9A','hFZFjoX2cGg','lp-EO5I60KA','2Vv-BfVoq4g','CevxZvSJLk8','pRpeEdMmmQ0',
  'e-ORhEE9VVg','YVkUvmDQ3HY','YlUKcNNmywk','ZbZSe6N_BXs','5GL9JoH4Sws','Zi_XLOBDo_Y','J---aiyznGQ',
  '450p7goxZqg','kffacxfA7G4','fRh_vgS2dFE','OPf0YbXqDm0','y6120QOlsfU','uelHwf8o7_U','fJ9rUzIMcZQ',
  '8UVNT4wvIGY','09R8_2nJtjg','0KSOMA3QBU0','ktvTqknDobU','ScMzIvxBSi4','QJO3RPMTJxQ','yPYZ_pyOmTk',
  'gCYcHz2k0xY','BROWqjuT0d4','tVj0jTs-r1o','cLQZKbTaS1g','kXYiU_JCYtU','N_lWpVIQOxQ','IO9XJXDXcF0',
  'Ye7FKc1CgKy0','_OBlgSz8sSM','dMH0bHeiRNg','k85mRPqvMbM','M7lc1UVf-VE','YE7UQLjk9-8','eBU34NZKDwY',
  'HgzGwKwLmgM','QRS8KEKhqtU','9E6b3swbbWg','RgKAFyr5Sl4','SlPhMPnEX4A','astISOttQS0','QH2-TGUlwu4',
  '1xw4S-hfeAk','7wtfSzwfglw','3JZ_D3XPZSA','PIh2-ezDown8','hT_nv6nkjQ4','07QASMagLgM','QDYDrRU3Hrc',
  'Y1xsXRihNhQ','R7E9S55L7A0','RBumgq5yV7A','60ItHLz0Waa','ALZHFhU2UWs','V1bFr2CW1qI','nCDQLDvEJoU',
  'gCYcHz2k0xY','BROWqjuT0d4','tVj0jTs-r1o','cLQZKbTaS1g','kXYiU_JCYtU','N_lWpVIQOxQ','IO9XJXDXcF0',
  'Ye7FKc1CgKy0','FTQbiNvZqaY','L_jWHffIx5E','hTWKbfoikeg','09839DpTctU','fLexgOxsZu0','YQHsXMglC9A',
  'hFZFjoX2cGg','lp-EO5I60KA','2Vv-BfVoq4g','CevxZvSJLk8','pRpeEdMmmQ0','e-ORhEE9VVg','YVkUvmDQ3HY',
  'YlUKcNNmywk','ZbZSe6N_BXs','5GL9JoH4Sws','Zi_XLOBDo_Y','J---aiyznGQ','450p7goxZqg','kffacxfA7G4',
  'fRh_vgS2dFE','OPf0YbXqDm0','y6120QOlsfU','uelHwf8o7_U','fJ9rUzIMcZQ','8UVNT4wvIGY','09R8_2nJtjg',
  '0KSOMA3QBU0','ktvTqknDobU','ScMzIvxBSi4','QJO3RPMTJxQ','yPYZ_pyOmTk','gCYcHz2k0xY','BROWqjuT0d4',
  'tVj0jTs-r1o','cLQZKbTaS1g','kXYiU_JCYtU','N_lWpVIQOxQ','IO9XJXDXcF0','Ye7FKc1CgKy0','_OBlgSz8sSM',
  'dMH0bHeiRNg','k85mRPqvMbM','M7lc1UVf-VE','YE7UQLjk9-8','eBU34NZKDwY','HgzGwKwLmgM','QRS8KEKhqtU',
  '9E6b3swbbWg','RgKAFyr5Sl4','SlPhMPnEX4A','astISOttQS0','QH2-TGUlwu4','1xw4S-hfeAk','7wtfSzwfglw',
  '3JZ_D3XPZSA','PIh2-ezDown8','hT_nv6nkjQ4','07QASMagLgM','QDYDrRU3Hrc','Y1xsXRihNhQ','R7E9S55L7A0',
  'RBumgq5yV7A','60ItHLz0Waa','ALZHFhU2UWs','V1bFr2CW1qI','nCDQLDvEJoU','gCYcHz2k0xY','BROWqjuT0d4',
  'tVj0jTs-r1o','cLQZKbTaS1g','kXYiU_JCYtU','N_lWpVIQOxQ','IO9XJXDXcF0','Ye7FKc1CgKy0','FTQbiNvZqaY',
  'L_jWHffIx5E','hTWKbfoikeg','09839DpTctU','fLexgOxsZu0','YQHsXMglC9A','hFZFjoX2cGg','lp-EO5I60KA',
  '2Vv-BfVoq4g','CevxZvSJLk8','pRpeEdMmmQ0','e-ORhEE9VVg','YVkUvmDQ3HY','YlUKcNNmywk','ZbZSe6N_BXs',
  '5GL9JoH4Sws','Zi_XLOBDo_Y','J---aiyznGQ','450p7goxZqg','kffacxfA7G4','fRh_vgS2dFE','OPf0YbXqDm0',
  'y6120QOlsfU','uelHwf8o7_U','fJ9rUzIMcZQ','8UVNT4wvIGY','09R8_2nJtjg','0KSOMA3QBU0','ktvTqknDobU',
  'ScMzIvxBSi4','QJO3RPMTJxQ','yPYZ_pyOmTk','gCYcHz2k0xY','BROWqjuT0d4','tVj0jTs-r1o','cLQZKbTaS1g',
  'kXYiU_JCYtU','N_lWpVIQOxQ','IO9XJXDXcF0','Ye7FKc1CgKy0','_OBlgSz8sSM','dMH0bHeiRNg','k85mRPqvMbM',
  'M7lc1UVf-VE','YE7UQLjk9-8','eBU34NZKDwY','HgzGwKwLmgM','QRS8KEKhqtU','9E6b3swbbWg','RgKAFyr5Sl4',
  'SlPhMPnEX4A','astISOttQS0','QH2-TGUlwu4','1xw4S-hfeAk','7wtfSzwfglw','3JZ_D3XPZSA','PIh2-ezDown8',
  'hT_nv6nkjQ4','07QASMagLgM','QDYDrRU3Hrc','Y1xsXRihNhQ','R7E9S55L7A0','RBumgq5yV7A','60ItHLz0Waa',
  'ALZHFhU2UWs','V1bFr2CW1qI','nCDQLDvEJoU','gCYcHz2k0xY','BROWqjuT0d4','tVj0jTs-r1o','cLQZKbTaS1g',
  'kXYiU_JCYtU','N_lWpVIQOxQ','IO9XJXDXcF0','Ye7FKc1CgKy0','FTQbiNvZqaY','L_jWHffIx5E','hTWKbfoikeg',
  '09839DpTctU','fLexgOxsZu0','YQHsXMglC9A','hFZFjoX2cGg','lp-EO5I60KA','2Vv-BfVoq4g','CevxZvSJLk8',
  'pRpeEdMmmQ0','e-ORhEE9VVg','YVkUvmDQ3HY','YlUKcNNmywk','ZbZSe6N_BXs','5GL9JoH4Sws','Zi_XLOBDo_Y',
  'J---aiyznGQ','450p7goxZqg','kffacxfA7G4','fRh_vgS2dFE','OPf0YbXqDm0','y6120QOlsfU','uelHwf8o7_U',
  'fJ9rUzIMcZQ','8UVNT4wvIGY','09R8_2nJtjg','0KSOMA3QBU0','ktvTqknDobU','ScMzIvxBSi4','QJO3RPMTJxQ',
  'yPYZ_pyOmTk','gCYcHz2k0xY','BROWqjuT0d4','tVj0jTs-r1o','cLQZKbTaS1g','kXYiU_JCYtU','N_lWpVIQOxQ',
  'IO9XJXDXcF0','Ye7FKc1CgKy0','_OBlgSz8sSM','dMH0bHeiRNg','k85mRPqvMbM','M7lc1UVf-VE','YE7UQLjk9-8',
  'eBU34NZKDwY','HgzGwKwLmgM','QRS8KEKhqtU','9E6b3swbbWg','RgKAFyr5Sl4','SlPhMPnEX4A','astISOttQS0',
  'QH2-TGUlwu4','1xw4S-hfeAk','7wtfSzwfglw','3JZ_D3XPZSA','PIh2-ezDown8','hT_nv6nkjQ4','07QASMagLgM',
  'QDYDrRU3Hrc','Y1xsXRihNhQ','R7E9S55L7A0','RBumgq5yV7A','60ItHLz0Waa','ALZHFhU2UWs','V1bFr2CW1qI',
  'nCDQLDvEJoU','gCYcHz2k0xY','BROWqjuT0d4','tVj0jTs-r1o','cLQZKbTaS1g','kXYiU_JCYtU','N_lWpVIQOxQ',
  'IO9XJXDXcF0','Ye7FKc1CgKy0','FTQbiNvZqaY','L_jWHffIx5E','hTWKbfoikeg','09839DpTctU','fLexgOxsZu0',
  'YQHsXMglC9A','hFZFjoX2cGg','lp-EO5I60KA','2Vv-BfVoq4g','CevxZvSJLk8','pRpeEdMmmQ0','e-ORhEE9VVg',
  'YVkUvmDQ3HY','YlUKcNNmywk','ZbZSe6N_BXs','5GL9JoH4Sws','Zi_XLOBDo_Y','J---aiyznGQ','450p7goxZqg',
  'kffacxfA7G4','fRh_vgS2dFE','OPf0YbXqDm0','y6120QOlsfU','uelHwf8o7_U','fJ9rUzIMcZQ','8UVNT4wvIGY',
  '09R8_2nJtjg','0KSOMA3QBU0','ktvTqknDobU','ScMzIvxBSi4','QJO3RPMTJxQ','yPYZ_pyOmTk','gCYcHz2k0xY',
  'BROWqjuT0d4','tVj0jTs-r1o','cLQZKbTaS1g','kXYiU_JCYtU','N_lWpVIQOxQ','IO9XJXDXcF0','Ye7FKc1CgKy0',
  'dQw4w9WgXcQ','kJQP7ki5MkU','9bZkp7q19f0','jNQXAC9IVRw','aqz-KE-bpKQ','ZZ5LpwO-An4','oHg5SJYRHA0',
  'NF-kLy44BGA','FTQbiNvZqaY','RgKAFyr5Sl4','L_jWHffIx5E','hTWKbfoikeg','09839DpTctU','fLexgOxsZu0',
  'YQHsXMglC9A','SlPhMPnEX4A','hFZFjoX2cGg','astISOttQS0','lp-EO5I60KA','2Vv-BfVoq4g','QH2-TGUlwu4',
  'CevxZvSJLk8','1xw4S-hfeAk','pRpeEdMmmQ0','e-ORhEE9VVg','7wtfSzwfglw','3JZ_D3XPZSA','PIh2-ezDown8',
  'hT_nv6nkjQ4','YVkUvmDQ3HY','YlUKcNNmywk','ZbZSe6N_BXs','5GL9JoH4Sws','07QASMagLgM','Zi_XLOBDo_Y',
  'QDYDrRU3Hrc','J---aiyznGQ','Y1xsXRihNhQ','450p7goxZqg','kffacxfA7G4','R7E9S55L7A0','RBumgq5yV7A',
  'fRh_vgS2dFE','OPf0YbXqDm0','y6120QOlsfU','60ItHLz0Waa','uelHwf8o7_U','yPYZ_pyOmTk','ALZHFhU2UWs',
  'V1bFr2CW1qI','fJ9rUzIMcZQ','QJO3RPMTJxQ','nCDQLDvEJoU','8UVNT4wvIGY','gCYcHz2k0xY','09R8_2nJtjg',
  'BROWqjuT0d4','tVj0jTs-r1o','0KSOMA3QBU0','ktvTqknDobU','cLQZKbTaS1g','ScMzIvxBSi4','IO9XJXDXcF0',
  'Ye7FKc1CgKy0','kXYiU_JCYtU','N_lWpVIQOxQ','_OBlgSz8sSM','dMH0bHeiRNg','k85mRPqvMbM','M7lc1UVf-VE',
  'YE7UQLjk9-8','eBU34NZKDwY','HgzGwKwLmgM','QRS8KEKhqtU','9E6b3swbbWg',
  'XqZsoesa55w','JGwWNGJdvx8','PT2_F-1esPk','MYxAiK6VnXw','yyDUC1LUXSU','nlcIKhJSsBU','fWNaR-r-xMY',
  '8jPQjjsBbIc','jofNR_WkoCE','kdemFfbS5H0','r7qOvP0NfeU','gdZLi9oYuZE','WMweEpGxp_U','fKopy74weus',
  'Y4H8Cpv8GkA','kTJczUOCtHY','U3mFa5O5sFc','G7KNmW9a75Y','TUVcZ2JEG1M','E07-D3FBG0Q','DyDfgMOUjCI',
  'ApXoWgfEaPg','bo_efYhYU2A','GhF-_F1F8sY','vhR0vNqX30s','HCj0KnG2Z68','k2qg6cT9W94','gl1aHhXnN1k',
  'QBu5GdWK0xQ','ZmDBbnmXq1Q','tQ0yjYqfWyY','6swmTBVI83k','UNEZArQjX74','txU59TlhEJw','OWsMtTyOZJg',
  'koxMI26L5dY','OQSNhk5ICTI','a1Y73sPHKxw','lj3iNxZ8Dww','eNPH8Mv0RUM','kfVsfOSbJY0','xbhCPt6PZIU',
  '1t7VPPGReE4','Cdn3MD4E2tk','bx1Bh8ZvH84','gGdAFtwGMFE','1k8craCGpgs','1vhFYVrZ8-0','gxEPV4F42QQ',
  'YkgkThdzX-8','A_MjCqQoLLA','Os6_vWd1NTE','sOnqjkJTMaA','oRdxCA_dsw8','h_D3VFfhvs4','pEQH8AyQtCE',
  '4m1EFMoRFvI','ViwtNLUqkFM','Cdv7tGBOKak','tg00YEIOFps','2Abk1jAONjw','qrO4YZeyl0I','rYEDA3JcQqw',
  'hLQl3WPOokw','DeumyOzKqgI','nfWlot6h_JM','3WtAngVIYj8','b1kbLwvqugk','ymNiUARI3Y4','iPUmE-tne5U',
  'RgKAFyr5Sl4','WNeLUngb-xg','lp-EO5I60KA','hT_nv6nkjQ4','PIh2-ezDown8','astISOttQS0','SlPhMPnEX4A',
  '1xw4S-hfeAk','7wtfSzwfglw','3JZ_D3XPZSA','07QASMagLgM','Y1xsXRihNhQ','R7E9S55L7A0','RBumgq5yV7A',
  '60ItHLz0Waa','yPYZ_pyOmTk','ALZHFhU2UWs','V1bFr2CW1qI','QJO3RPMTJxQ','nCDQLDvEJoU','gCYcHz2k0xY',
  'BROWqjuT0d4','tVj0jTs-r1o','cLQZKbTaS1g','kXYiU_JCYtU','N_lWpVIQOxQ','IO9XJXDXcF0','Ye7FKc1CgKy0'
) | Select-Object -Unique

Write-Host "=== PHASE 1: Validate $targetCount unique URLs locally (yt-dlp) ===" -ForegroundColor Cyan
Write-Host "Candidates: $($candidateIds.Count)"
$validated = @()
foreach ($id in $candidateIds) {
  if ($validated.Count -ge $targetCount) { break }
  $url = "https://www.youtube.com/watch?v=$id"
  try {
    $title = & $ytdlp --skip-download --no-warnings --print title --print duration "$url" 2>$null
    if ($title -and $title.Count -ge 1 -and $title[0]) {
      $validated += [pscustomobject]@{ url = $url; id = $id; title = $title[0]; duration = if ($title.Count -ge 2) { $title[1] } else { $null } }
      Write-Host ("OK $($validated.Count): $id - $($title[0].Substring(0,[Math]::Min(50,$title[0].Length)))")
    } else {
      Write-Host "SKIP $id"
    }
  } catch {
    Write-Host "SKIP $id"
  }
  Start-Sleep -Milliseconds 150
}

$testCount = $validated.Count
Write-Host ""
Write-Host "Validated unique public URLs: $testCount"
if ($testCount -lt $targetCount) {
  Write-Host "WARNING: only $testCount unique URLs available (target was $targetCount)" -ForegroundColor Yellow
}

$validated | Export-Csv 'C:\Users\rakpa\video\tmp-loadtest-100-unique-validated.csv' -NoTypeInformation

Write-Host ""
Write-Host "=== PHASE 2: Pre-warm via production API ($testCount URLs) ===" -ForegroundColor Cyan
$warmOk = 0
foreach ($v in $validated) {
  try {
    $null = Invoke-RestMethod -Uri "$api/api/info" -Method POST -Body (@{url=$v.url}|ConvertTo-Json -Compress) -ContentType 'application/json' -TimeoutSec 90
    $warmOk++
  } catch { Write-Host "warm fail: $($v.id)" }
  Start-Sleep -Milliseconds 300
}
Write-Host "Pre-warm OK: $warmOk / $testCount"
Write-Host "Cooldown 60s..." -ForegroundColor Yellow
Start-Sleep -Seconds 60

Write-Host ""
Write-Host "=== PHASE 3: $testCount simultaneous 1080p downloads (production API) ===" -ForegroundColor Cyan
Write-Host "Started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$overall = [System.Diagnostics.Stopwatch]::StartNew()
$jobs = @()
for ($i = 0; $i -lt $testCount; $i++) {
  $idx = $i + 1
  $u = $validated[$i].url
  $jobs += Start-Job -ArgumentList $idx, $u, $api -ScriptBlock {
    param($Index, $Url, $ApiBase)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $result = [ordered]@{ index=$Index; url=$Url; infoMs=$null; startMs=$null; totalMs=$null; path=$null; status='pending'; error=$null; directHeight=$null; title=$null }
    try {
      $t0 = [System.Diagnostics.Stopwatch]::StartNew()
      $infoRes = Invoke-RestMethod -Uri "$ApiBase/api/info" -Method POST -Body (@{url=$Url}|ConvertTo-Json -Compress) -ContentType 'application/json' -TimeoutSec 120
      $t0.Stop(); $result.infoMs = [int]$t0.ElapsedMilliseconds
      if ($infoRes.title) { $result.title = $infoRes.title.Substring(0,[Math]::Min(50,$infoRes.title.Length)) }
      $t1 = [System.Diagnostics.Stopwatch]::StartNew()
      $dlRes = Invoke-RestMethod -Uri "$ApiBase/api/download" -Method POST -Body (@{url=$Url;quality='1080';mode='best'}|ConvertTo-Json -Compress) -ContentType 'application/json' -TimeoutSec 120
      $t1.Stop(); $result.startMs = [int]$t1.ElapsedMilliseconds
      if ($dlRes.direct -and $dlRes.url) {
        $result.path='direct-cdn'; $result.status='direct'; $result.directHeight=$dlRes.height
        $sw.Stop(); $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result
      }
      if (-not $dlRes.jobId) { $result.status='failed'; $result.error='No jobId'; $sw.Stop(); $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result }
      $jobId = $dlRes.jobId; $deadline = (Get-Date).AddMinutes(6)
      while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 2000
        try { $st = Invoke-RestMethod -Uri "$ApiBase/api/file/$jobId/status" -TimeoutSec 30 } catch { continue }
        if ($st.status -eq 'ready') { $result.path='job-pipeline'; $result.status='ready'; $sw.Stop(); $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result }
        if ($st.status -eq 'error') { $result.path='job-pipeline'; $result.status='error'; $result.error=$st.message; $sw.Stop(); $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result }
      }
      $result.status='timeout'; $sw.Stop(); $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result
    } catch {
      $sw.Stop(); $result.status='failed'; $result.error=$_.Exception.Message; $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result
    }
  }
}

$results = @($jobs | Wait-Job | Receive-Job)
$jobs | Remove-Job -Force
$overall.Stop()

$ok = @($results | Where-Object { $_.status -in @('ready','direct') })
$failed = @($results | Where-Object { $_.status -notin @('ready','direct') })
$direct = @($ok | Where-Object { $_.path -eq 'direct-cdn' })
$pipeline = @($ok | Where-Object { $_.path -eq 'job-pipeline' })

Write-Host ""
Write-Host "=== FINAL RESULTS ===" -ForegroundColor Cyan
Write-Host "Unique public URLs tested: $testCount"
Write-Host "Success: $($ok.Count) ($([math]::Round(100*$ok.Count/[Math]::Max(1,$testCount),1))%) | Failed: $($failed.Count)"
Write-Host "Direct CDN: $($direct.Count) | Job pipeline: $($pipeline.Count)"
Write-Host "Wall-clock: $([math]::Round($overall.ElapsedMilliseconds/1000))s"
if ($ok.Count -gt 0) {
  $times = @($ok.totalMs | Sort-Object)
  $p50 = $times[[math]::Floor($times.Count/2)]
  $p95 = $times[[math]::Min($times.Count-1, [math]::Floor($times.Count*0.95))]
  Write-Host "Time min/p50/p95/max: $($times[0]) / $p50 / $p95 / $($times[-1]) ms"
}
Write-Host ""
Write-Host "=== FAILURES BY TYPE ===" -ForegroundColor Yellow
$failed | Group-Object status | Format-Table Name, Count -AutoSize
$failed | Group-Object { if ($_.error -match '422') { '422-metadata' } elseif ($_.error -match '402') { '402-quota' } elseif ($_.error -match 'timeout|Timed') { 'timeout' } else { 'other' } } | Format-Table Name, Count -AutoSize
Write-Host "=== TOP 10 FASTEST ===" -ForegroundColor Green
$ok | Sort-Object totalMs | Select-Object -First 10 | Format-Table index, status, path, totalMs, directHeight, title -AutoSize
Write-Host "=== SLOWEST 5 FAILURES ===" -ForegroundColor Red
$failed | Sort-Object totalMs -Descending | Select-Object -First 5 | Format-Table index, status, totalMs, error -AutoSize

$results | Export-Csv 'C:\Users\rakpa\video\tmp-loadtest-100-unique-results.csv' -NoTypeInformation
Write-Host "Saved: tmp-loadtest-100-unique-validated.csv, tmp-loadtest-100-unique-results.csv"
