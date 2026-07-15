import 'package:flutter/material.dart';

/// Side menu — profile, settings, and folder actions.
class AppMenuDrawer extends StatelessWidget {
  const AppMenuDrawer({
    super.key,
    required this.onProfile,
    required this.onSettings,
    required this.onCreateFolder,
  });

  final VoidCallback onProfile;
  final VoidCallback onSettings;
  final VoidCallback onCreateFolder;

  static const _primary = Color(0xFF0040A1);

  @override
  Widget build(BuildContext context) {
    return Drawer(
      backgroundColor: const Color(0xFFF9F9FB),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(24, 24, 24, 8),
              child: Text(
                'Paperly',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w600,
                  color: _primary,
                ),
              ),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(24, 0, 24, 16),
              child: Text(
                'Menu',
                style: TextStyle(color: Color(0xFF737785)),
              ),
            ),
            _MenuTile(
              icon: Icons.person_rounded,
              label: 'Profile',
              onTap: onProfile,
            ),
            _MenuTile(
              icon: Icons.settings_rounded,
              label: 'Settings',
              onTap: onSettings,
            ),
            const Divider(height: 24, indent: 24, endIndent: 24),
            _MenuTile(
              icon: Icons.create_new_folder_rounded,
              label: 'New folder',
              onTap: onCreateFolder,
            ),
          ],
        ),
      ),
    );
  }
}

class _MenuTile extends StatelessWidget {
  const _MenuTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: const Color(0xFF424654)),
      title: Text(
        label,
        style: const TextStyle(
          fontWeight: FontWeight.w500,
          color: Color(0xFF1A1C1D),
        ),
      ),
      onTap: onTap,
    );
  }
}
