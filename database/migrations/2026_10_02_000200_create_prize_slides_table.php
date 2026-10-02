<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The prizes for the Prize Display: a screen that shows nothing but one
     * prize, for raffles drawn by hand on stage. The operator saves prizes
     * here and puts one live at a time.
     */
    public function up(): void
    {
        Schema::create('prize_slides', function (Blueprint $table) {
            $table->id();
            $table->string('title', 160)->nullable();
            $table->string('prize_name', 160);
            $table->string('prize_type', 16)->default('cash');
            $table->decimal('prize_value', 14, 2)->nullable();
            $table->string('prize_currency', 8)->nullable();
            $table->json('logos')->nullable();
            $table->boolean('is_live')->default(false)->index();
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prize_slides');
    }
};
