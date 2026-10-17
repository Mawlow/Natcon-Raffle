<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** The Prize Display's top-left and top-right logos, either side of NATCON, like a raffle's screens. */
    public function up(): void
    {
        Schema::table('prize_slides', function (Blueprint $table) {
            $table->string('logo_left', 120)->nullable()->after('logos');
            $table->string('logo_right', 120)->nullable()->after('logo_left');
        });
    }

    public function down(): void
    {
        Schema::table('prize_slides', function (Blueprint $table) {
            $table->dropColumn(['logo_left', 'logo_right']);
        });
    }
};
