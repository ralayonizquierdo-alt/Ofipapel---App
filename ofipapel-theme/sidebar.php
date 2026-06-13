<?php
if (!is_active_sidebar('shop-sidebar')) return;
?>
<aside class="sidebar" role="complementary" aria-label="Barra lateral">
    <?php dynamic_sidebar('shop-sidebar'); ?>
</aside>
