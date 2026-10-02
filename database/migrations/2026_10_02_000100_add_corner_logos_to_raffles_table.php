<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Two catalogue logos for the "Congratulations" screen's top corners,
     * either side of the NATCON logo.
     */
    public function up(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->string('logo_left', 160)->nullable()->after('logos');
            $table->string('logo_right', 160)->nullable()->after('logo_left');
        });
    }

    public function down(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->dropColumn(['logo_left', 'logo_right']);
        });
    }
};
